# Architecture Decision Records (ADRs) — EVENTOS Copilot

## ADR-001: Separation of Deterministic Reasoning from LLM Natural Language Generation

### Context
Using LLMs directly for event decision-making (determining check-in priority, queue routing, judge assignment, or leaderboard calculations) creates non-deterministic failures, hallucinated rationales, and authorization bypasses.

### Decision
We strictly isolate decision-making to a **Deterministic Decision Engine** written in pure TypeScript rule functions. The decision pipeline is:
`User -> Auth -> Context Engine -> Decision Engine (rules) -> Structured Recommendation -> Assistant Layer (LLM) -> User`.

### Consequences
- **Pros:** 100% testable rules, zero non-deterministic decision drift, zero hallucinations on operational rules.
- **Cons:** LLM prompt engineering requires rigid adherence to structured context input.

---

## ADR-002: Runnable Demo SQLite Engine vs Production PostgreSQL Architecture

### Context
Evaluators need a zero-friction demo experience (`git clone -> npm install -> npm start`). Requiring local PostgreSQL setup, background daemons, and credential configuration reduces evaluator velocity and causes setup failures.

### Decision
- **Demo / Development:** Built-in file/in-memory SQLite database (`node:sqlite` / `better-sqlite3` compatible) supporting `FOREIGN KEY` constraints, `CHECK` bounds, atomic transactions, and JSON columns.
- **Production Architecture:** PostgreSQL with connection pooling and async outbox table relay worker.

### Consequences
- Evaluators execute tests and start server in under 5 seconds with zero setup.
- Production migration strategy is fully documented in `docker-compose.yml` and `architecture.md`.

---

## ADR-003: Asymmetric Key Pairs for Offline QR Credential Verification

### Context
Hackathon venues frequently experience spotty Wi-Fi / cellular connectivity. Check-in scanners must verify participant credentials offline without sharing a master secret key that could be compromised if an offline scanner device is inspected.

### Decision
The server retains an ECDSA private key and issues short-lived (20–30s) signed tokens. Offline scanners carry only the public key to verify signatures locally. The central server maintains an authoritative TTL used-token store to prevent replay attacks upon reconnect.

### Consequences
- **Pros:** Offline scanner security, zero secret leak vulnerability on client devices.
- **Cons:** Requires rotation sync on mobile client timekeeping (within 30s window).

---

## ADR-004: Configuration Versioning for Critical Domain Policies

### Context
Modifying a judging rubric or team size policy mid-event must not retroactively change or corrupt existing submissions and scores evaluated under previous policy definitions.

### Decision
All configuration entities (`rubric`, `ranking_algorithm`, `team_size_policy`, `checkin_policy`, `venue_capacity`) are immutable. Updating a configuration creates a new version record (`version: N+1`). All domain records store `config_version_id`.

### Consequences
- **Pros:** Full historical auditability, immutable evaluation baselines.
- **Cons:** Additional foreign key relationships on domain models.
