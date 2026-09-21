# Feature documentation layout

Each product feature lives under `docs/features/{feature-name}/` with this set:

| File | Purpose |
|------|---------|
| `overview.md` | Problem, placement (core/module/�), non-goals, owners |
| `requirements.md` | Functional + non-functional requirements, acceptance |
| `data-model.md` | Tables, keys, immutability, RLS |
| `api.md` | HTTP/commands, idempotency, errors |
| `permissions.md` | Roles, permissions, scope, SensitiveAuthz |
| `state-machine.md` | States, transitions, illegal paths |
| `events.md` | Domain/outbox events, payloads (no secrets) |
| `security.md` | Threats, controls, logging/redaction |
| `testing.md` | Suite map + critical cases |
| `operations.md` | Runbooks, queues, retries, reconciliation |
| `rollout.md` | Flags, migration, tenant rollout, kill switch |

Copy `_template/` to a new folder. Do not mark a feature �done� without these files (stubs OK if linked to ADRs/migrations).

**Feature-name:** kebab-case (`student-fees`, `assessment-examination`, `video-resources`).
