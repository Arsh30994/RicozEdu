# ADR-009: Transactional outbox

## Decision
Domain events written in the same DB transaction as business mutations, relayed asynchronously to Redis Stream.

## Consequences
At-least-once delivery with idempotency keys; no dual-write loss.
