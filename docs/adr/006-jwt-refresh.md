# ADR-006: Short-lived JWT + refresh rotation

## Decision
Access JWT (~15m) carries sub, av (authorization_version), sid. Refresh tokens rotate; reuse revokes family and bumps av.

## Consequences
Stolen access tokens expire quickly; refresh theft is detectable.
