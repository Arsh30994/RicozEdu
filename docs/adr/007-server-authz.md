# ADR-007: Server-side permission evaluation

## Decision
Permissions loaded from DB (cached by user+tenant+av). Frontend never authoritative for authz.

## Consequences
Role changes take effect after av bump or cache TTL.
