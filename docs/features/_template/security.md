# {Feature name} � security

## Threats
| Threat | Severity | Control |
|--------|----------|---------|
| Cross-tenant IDOR | High | RLS + object-level checks |
| | | |

## Secrets
Storage (vault/KMS refs only):

## Logging / redaction
Keys that must never appear in logs:

## External input
Webhook signature, allowlists, capturable-event checks:

## Incident hooks
What to disable / which queues to pause:
