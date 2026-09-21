# ADR-001: Modular monolith first

## Decision
Ship RicozEdu as a NestJS modular monolith with clear domain modules. Extract microservices only when scale or isolation metrics demand it.

## Consequences
Simpler ops, shared transactions for outbox/audit, clearer Phase 0 delivery.
