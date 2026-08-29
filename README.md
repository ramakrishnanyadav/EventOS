# EVENTOS v4 — An Intelligent Operating System for Live Events

> **EVENTOS v4** is a production-quality, multi-role event platform built for hackathons, tech fests, conferences, competitions, developer events, and large-scale community operations.

---

## 🌟 Key Differentiators & Product Principles

1. **Embedded Contextual AI (DO NOT MAKE AI THE UI)**
   - Intelligence is embedded directly into user workflows as actionable recommendations, rather than an isolated generic chatbot.
   - *Participant:* "Your submission is missing a demo URL and closes in 28 minutes."
   - *Judge:* "Team 42 is your highest-priority eligible judging target."
   - *Organizer:* "Hall B is at 96% capacity. Leave by 14:45 to arrive on time for your next session."
   - *Operations:* "Moving two judges from Group 5 to Group 3 is projected to reduce judging delay from 18 min to 7 min."

2. **Policy-First Security Pipeline**
   ```
   User Request ➔ Auth / RBAC Policy ➔ Context Engine ➔ Deterministic Decision Engine ➔ Optional LLM Explanation ➔ Action / Recommendation
   ```
   - Policy check happens **BEFORE** context retrieval or LLM execution. Unauthorized queries (e.g. participant asking for organizer health) are rejected immediately.
   - The LLM *never* computes scores, rankings, authorization, deadlines, or security policies.

3. **Production Data & Security Architecture**
   - **Zero-Setup Database:** Runs natively on Node 22 SQLite (`node:sqlite` `DatabaseSync`) with zero C++ compilation dependencies.
   - **Asymmetric QR Credentials:** ECDSA signed short-lived tokens (20-30s TTL) with offline public key verification and server-authoritative anti-replay store.
   - **Transactional Outbox:** Scores and actions write outbox events within SQL transactions to guarantee monotonic sequence numbers on live WebSocket leaderboard streams.
   - **Judging Normalization Engine:** Configurable score strategies (`RAW`, `ZSCORE`, `TRIMMED_MEAN`, `MEDIAN`, `WINSORIZED`) with rubric versioning.

---

## 🗺️ Complete Information & Route Architecture

```
PUBLIC DISCOVERY PLATFORM
├── #/                                (Landing Page: "Discover. Build. Compete. Experience.")
├── #/discover                        (Event Discovery Engine with Search & Filters)
├── #/events/:slug                    (Event Detail Page + "Your Event Readiness" Panel)
├── #/events/:slug/leaderboard        (Public Live Rankings)
├── #/organizations                   (Organization Ecosystem Profiles)
├── #/people                          (People & Teammate Discovery)
└── #/profile                         (Developer Profile: Skills, Wins, Joined Events)

PARTICIPANT WORKSPACE (#/dashboard)
├── #/dashboard/my-events             (My Events Dashboard & Event Lifecycle Journey)
├── #/dashboard/teams                 (Team Workspace & Deterministic Skill Matchmaker)
├── #/dashboard/submissions           (Submission Portal with 72% Checklist & Validation)
└── #/app/events/:slug/check-in       (Asymmetric ECDSA QR Check-in)

JUDGE DESK (#/judge)
├── #/judge/queue                     (Judge Desk & Priority Evaluation Queue)
├── #/judge/evaluate/:submissionId    (Split-Screen Review Environment with Rubric Sliders)
└── #/judge/conflicts                 (Conflict of Interest & History Log)

ORGANIZER COMMAND CENTER (#/organizer)
├── #/organizer/overview              (Command Center Overview: Live Pulse & Predictive Health)
├── #/organizer/risks                 (Operational Risks & Anomaly Radar)
├── #/organizer/venues                (Live Event Digital Twin Zone Model)
├── #/organizer/simulate              (What-If Scenario Simulation Engine)
├── #/organizer/actions               (Event Action Center with Human Approval Queue)
├── #/organizer/announcements         (Targeted Announcement Dispatcher)
└── #/organizer/audit                 (Immutable Audit Center Stream)
```

---

## 🧪 Testing & Execution

### Run Automated Tests
```bash
npm test
```
*Executes all 17 test cases across 6 test suites using Node's native test runner via TypeScript transpilation.*

### Run Local Server
```bash
npm start
```
*Launches the REST API & WebSocket server on `http://localhost:3000`.*
