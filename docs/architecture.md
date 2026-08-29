# EVENTOS Copilot — System Architecture & Design Specification

## 1. Executive Summary & Product Surface Reframe

EVENTOS Copilot is a context-aware event operations assistant built on the EVENTOS platform. Unlike traditional event dashboards, the **assistant is the primary user surface**:

```
[ User Query ]
      │
      ▼
[ 1. Authorization Layer ] ──(RBAC & Policy Check)──► [ Reject Unauthorized ]
      │
      ▼ (Allowed Data Context Only)
[ 2. Context Engine ] ──────(Gathers live event state, location, workload, schedule)
      │
      ▼
[ 3. Deterministic Decision Engine ] ──(Named, unit-tested rule functions)
      │
      ▼ (Structured Recommendation Output)
[ 4. Assistant Explanation Layer ] ────(LLM translates structure into concise natural language)
      │
      ▼
[ Actionable Time-Aware Recommendation ]
```

---

## 2. Core Invariants & Engineering Guarantees

1. **LLM Non-Decision Guarantee:** The LLM *never* invents recommendations or computes priorities. Deterministic rule functions compute priorities, rankings, leave-by times, and health scores. The LLM only formats explanations.
2. **Policy-First Authorization:** Requests are evaluated against RBAC policy *before* any data reaches the Context Engine or LLM. A participant asking for judge scores is rejected at the policy layer.
3. **Transaction & Outbox Pattern:** All mutating state changes execute in a single database transaction alongside an `outbox_events` insert. An asynchronous relay worker dispatches events to the internal event bus.
4. **Asymmetric QR Credentials:** The server holds an ECDSA private key and issues 20–30 second rotating signed tokens over TLS. Scanners verify tokens offline using the public key. Replay protection is enforced by a server-side TTL used-token store.
5. **Config Versioning:** Operational rules (rubrics, ranking algorithms, team sizes, venue capacities) are immutable. Updating a configuration creates a new version number; existing historical data retains pointers to its exact active version.

---

## 3. Modular Monolith Directory Structure

```
eventos/
├── apps/
│   ├── web/                # Assistant-first SPA interface (WCAG 2.2 AA compliant)
│   └── api/                # REST & WebSocket API Server
├── modules/
│   ├── common/             # Database initialization, transaction manager, outbox
│   ├── identity/           # User authentication, RBAC policy engine
│   ├── events/             # Config-versioned event & session management
│   ├── participants/       # Participant registration & status
│   ├── attendance/         # Asymmetric QR token issuance, offline verification, anti-replay
│   ├── teams/              # Team formation, active team invariant enforcement
│   ├── submissions/        # Submission lifecycle, deadline locking, override logic
│   ├── judging/            # Rubric validation, COI checks, score normalization, anomaly flags
│   ├── ranking/            # Leaderboard projections with monotonic sequence numbers
│   ├── venues/             # Venue intelligence, capacity tracking, congestion alerts
│   └── incidents/          # Operational incident logging and severity tracking
├── intelligence/
│   ├── context/            # Context Engine (structured state builder)
│   ├── rules/              # Decision Engine (deterministic rule functions)
│   ├── recommendations/    # Persona action recommendation models
│   └── assistant/          # Security-aware Assistant Explanation Layer
├── realtime/               # Channel-scoped WebSocket manager (Snapshot + Resume)
├── tests/
│   ├── unit/               # Rule functions & score normalization unit tests
│   ├── security/           # RBAC policy & QR signing security tests
│   ├── integration/        # Outbox -> projection integration tests
│   └── e2e/                # Participant, Judge, and Organizer E2E journeys
├── docs/                   # Architecture, ADRs, Threat model
├── package.json
├── tsconfig.json
├── docker-compose.yml
└── README.md
```

---

## 4. Persona Showcase Workflows

### Participant Workflow ("What do I need to do now?")
1. **Context Engine** gathers: `checked_in=true`, `submission_status=INCOMPLETE`, `submission_pct=72%`, `current_time=14:32`, `session_start=15:00`, `hall_b_occupancy=91%`.
2. **Decision Engine** evaluates named rules:
   - Rule `checkDeadlinePressure`: `deadline_in_minutes=28` -> `priority=HIGH`.
   - Rule `calculateLeaveTime`: `venue_congestion=91%`, `walk_time=8min`, `crowd_buffer=5min` -> `leave_by=14:45`.
3. **Structured Recommendation**: `{ priority: "HIGH", primary_action: "complete_submission", secondary_action: "leave_for_workshop", leave_by: "14:45" }`.
4. **Assistant Explanation**: *"Your submission is 72% complete with 28 minutes left until the deadline. Additionally, Hall B is at 91% capacity—leave by 14:45 to arrive on time for your 15:00 workshop."*

### Judge Workflow ("What should I evaluate next?")
1. **Context Engine** gathers: assigned teams, already evaluated teams, conflict-of-interest list, submission timestamps, judge workload.
2. **Decision Engine** evaluates:
   - Excludes evaluated and conflicted teams.
   - Ranks remaining candidates by deadline pressure and judging delay.
3. **Structured Recommendation**: `{ recommended_team_id: "team_42", team_name: "NeuralShift", reason: "Highest deadline pressure, non-conflicted", assigned_rank: 1 }`.
4. **Assistant Explanation**: *"Evaluate Team 42 (NeuralShift) next. They submitted 45 minutes ago and have the highest deadline pressure among your non-conflicted assignments."*

### Organizer Workflow ("Is everything okay?")
1. **Context Engine** gathers: attendance rate (94%), venue occupancy metrics, submission progress (88%), judge evaluation progress (65%), judge workload variance, active incidents.
2. **Decision Engine** computes:
   - Overall Health Score: `87/100`.
   - Critical & Warning Risks:
     - 🔴 `Critical — Hall B capacity exceeded (96%)`
     - 🟡 `Warning — Judge Group 3 evaluation bottleneck (24min average lag)`
     - 🟡 `Warning — 17 teams approaching submission deadline without draft`
3. **Assistant Explanation**: *"Event Health is 87/100. Top priorities: 1) Hall B capacity is at 96%—redirect upcoming attendees. 2) Judge Group 3 is trailing by 24 minutes—reassign 3 teams to Group 1."*

---

## 5. Sequence-Numbered WebSocket Reconnect Protocol

```
Client                                  Server
  │                                       │
  ├────── Connect /subscribe?seq=104 ────►│
  │                                       │
  │◄───── 200 OK (Snapshot @ seq=112) ────┤  (Client updates local cache to snapshot)
  │                                       │
  │◄───── Event payload (seq=113) ────────┤  (Client applies live updates)
  │◄───── Event payload (seq=114) ────────┤
```

No client-side event replay required. The client connects with its last known `sequence_number`, gets a fresh state snapshot if lag is detected, and consumes sequence-numbered stream updates forward.
