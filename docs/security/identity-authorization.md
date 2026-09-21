# Identity & multi-tenant authorization

## Hierarchy

Platform ? Organisation (`tenants`) ? Institution ? Campus ? Faculty ? Department ? Programme ? Course ? Section ? Assigned student

## Rules enforced

1. One `persons` row; many roles via memberships + role_bindings (no duplicate accounts).
2. A user may have multiple institution-scoped memberships within a tenant.
3. Every request resolves membership server-side from `X-Tenant-Id` (never body `tenantId`).
4. Backend permission evaluation + PostgreSQL `FORCE RLS`.
5. `authorization_version` on users; short-lived access JWT (`sub`,`av`,`sid`); refresh rotation.
6. Sensitive operations revalidate grants (bypass cache); queued jobs call `DelegationService.revalidateJobPrincipal`.
7. Permission / search / analytics / AI cache keys are tenant-scoped and cleared on revocation.

## Components

| Piece | Location |
|-------|----------|
| Schema | `infra/migrations/001_*.sql`, `002_identity_authz_hierarchy.*.sql` |
| Tenant middleware | `TenantMembershipGuard` |
| Permission middleware | `PermissionGuard` + `@SensitiveAuthz` |
| Evaluator | `permission-evaluator.ts` |
| Scope resolver | `scope-resolver.ts` |
| Delegation lifecycle | `delegation.service.ts` (pending?active?expired/revoked) |
| Revocation | `revocation.service.ts` (bump av, revoke sessions/refresh, cache invalidate) |
| RLS | `tenant_isolation` policies on all tenant-owned tables |
| Audit | `permission.denied`, `membership.revoked`, `authz.version_bumped`, `delegation.*` |

## Test matrix (must pass)

| Case | Expected |
|------|----------|
| Wrong tenant header | 403 / empty RLS |
| Wrong institution scope | 403 |
| Wrong campus / faculty / department / section | 403 via scopeCoversResource |
| Expired delegation | grants excluded; job revalidate fails |
| Revoked membership | 403; av bumped |
| Object-ID from other tenant | 404 |
| Body `tenantId` | 400 |
| Stale `av` on access token | 401 |

## Example unauthorized requests

```http
GET /v1/students/{id-from-tenant-B}
Authorization: Bearer {tenant-A-token}
X-Tenant-Id: {tenant-A}
? 404

GET /v1/students/{id}
Authorization: Bearer {token}
X-Tenant-Id: {tenant-B-not-member}
? 403

POST /v1/students
{ "tenantId": "...", ... }
? 400

GET /v1/students/{id}
X-Tenant-Id: {A}
X-Institution-Id: {institution-outside-scope}
? 403 when binding scoped elsewhere
```

## Tenant-scoped peripherals

Cache key patterns: `perm:`, `grants:`, `search:tenant:`, `analytics:tenant:`, `ai:tenant:`. Object storage keys must be prefixed by `tenant_id` (see `object_references` in academic review model).
