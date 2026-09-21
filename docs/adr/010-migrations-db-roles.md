# ADR-010: SQL migrations + non-superuser app

## Decision
Numbered SQL migrations via ricoz_migrator. Application uses ricoz_app without superuser or BYPASSRLS.

## Consequences
RLS cannot be accidentally bypassed by the API role.
