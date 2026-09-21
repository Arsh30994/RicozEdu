# {Feature name} � events

## Domain / outbox events
| Event type | When | Aggregate | Idempotency key |
|------------|------|-----------|-----------------|
| | | | |

## Payload rules
- No secrets, full tokens, APAAR plaintext, PAN, or counselling notes.
- Include `tenantId`, `correlationId`, resource ids only.

## Consumers
| Consumer | Action | Failure |
|----------|--------|---------|
| | | Retry / DLQ |

## Ordering / dedup
-
