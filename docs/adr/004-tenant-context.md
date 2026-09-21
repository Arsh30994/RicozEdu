# ADR-004: Tenant context from verified membership

## Decision
Active tenant is taken from X-Tenant-Id only after server-side membership verification. Client-supplied tenant_id in body is rejected (400).

## Consequences
Prevents spoofed tenancy; requires membership row before any tenant-scoped work.
