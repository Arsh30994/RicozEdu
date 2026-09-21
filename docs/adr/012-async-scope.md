# ADR-012: Sync APIs + outbox only in Phase 0

## Decision
Phase 0 keeps request/response APIs synchronous except outbox relay. Heavy async (exports, video, AI) deferred.

## Consequences
Simpler operations while proving tenancy and identity.
