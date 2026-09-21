# ADR-003: PostgreSQL + FORCE RLS

## Decision
PostgreSQL is system of record. Every tenant-owned table has tenant_id and FORCE ROW LEVEL SECURITY. App role has no BYPASSRLS.

## Consequences
Defense in depth; missing tenant context returns zero rows.
