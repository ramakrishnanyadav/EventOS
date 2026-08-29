# Architectural Decision Records (ADR)

## ADR-004: Participants Schema Composite Uniqueness Migration

### Status
Accepted

### Context
Previously, the `participants` table schema in `modules/common/db.ts` was defined with `user_id TEXT UNIQUE NOT NULL`. This single-column unique constraint erroneously limited each user account to registering for exactly **one event** total across the platform's lifetime.

### Decision
Migrated the `participants` table definition to remove the single `user_id UNIQUE` constraint and replace it with a composite uniqueness constraint:
`CONSTRAINT unique_registration_per_event UNIQUE(user_id, event_id)`

### Consequences
- Users can now register for multiple multi-day events and hackathons across their account lifecycle.
- Idempotency is preserved per event (`(user_id, event_id)` prevents duplicate registrations for the same event).
