# STRIDE Threat Model & Security Mitigations — EVENTOS Copilot

| Threat Category | Target | Vector | Mitigation Strategy |
|---|---|---|---|
| **Spoofing** | QR Check-in | User screenshots or copies another participant's QR code | Rotating signed credentials (20–30s lifetime) issued with ECDSA private key. Nonce + timestamp embedded. |
| **Tampering** | Judging Scores | User/Judge intercepts API to submit score exceeding max bounds | Database `CHECK` constraint bound to rubric version + backend rule validation. |
| **Repudiation** | Score Submission & Override | Organizer overrides deadline or Judge modifies score | Every mutation writes an audit event to `outbox_events` with `actor_id`, timestamp, and `causation_id`. |
| **Information Disclosure** | Assistant Layer | Participant asks assistant for hidden judge scores or opponent project details | **Policy-First Authorization:** Requests are filtered by RBAC policy *before* entering the Context Engine or LLM. |
| **Denial of Service** | Event Stream / API | Replaying duplicate mutating API requests under network retry | `Idempotency-Key` header enforced on all mutating endpoints; server returns cached transaction response. |
| **Elevation of Privilege** | RBAC Policy | Participant manipulates request headers to gain Organizer role | Cryptographically verified session tokens + strict server-side role resolution per endpoint. |

---

## Security Invariants

1. **Policy Filter Before LLM:**
   ```
   Request -> Auth Header -> Policy Engine (Check Role & Permissions)
           ├─► Denied -> 403 Forbidden (LLM is NEVER invoked)
           └─► Allowed -> Context Engine -> Decision Engine -> LLM Explanation
   ```

2. **Server-Side Replay Store:**
   - Scanners submit verified check-ins with `credential_id`.
   - Server checks `used_credentials` table with TTL index. Duplicate submission returns `409 Conflict / Already Processed`.
