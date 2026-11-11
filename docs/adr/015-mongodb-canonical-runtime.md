# 015 MongoDB canonical runtime

## Status

Accepted for ongoing development. Production cutover remains conditional on an environment and data inventory.

## Context

RicozEdu currently contains two overlapping backends: an active Express and MongoDB service, and a legacy NestJS, PostgreSQL, and Redis service. Both contain identity, tenant, student, and academic concepts. Independent writes to overlapping records would create drift, unreliable reporting, and incompatible authorization decisions.

The current product direction is MongoDB for the active platform. This decision supersedes PostgreSQL as the destination for new active-runtime work. The legacy modules remain valuable source material and may continue to serve only clearly identified legacy capabilities while their equivalent MongoDB modules are not yet available.

## Decision

- Express and MongoDB are the canonical runtime and system of record for all newly implemented active-product domains.
- Each tenant-owned document has a `tenantId`; each query and reference validation is scoped to the authenticated tenant context.
- `RicozUser` is global. `RicozMembership` carries tenant-local role and additive permissions. Student, campus, academic-period, school, and higher-education documents belong to a tenant.
- School and higher-education academic structures remain separate: grades and sections are not aliases for programmes and courses.
- The legacy NestJS/PostgreSQL service must not receive writes for an entity that the active MongoDB runtime owns. No dual-write bridge will be introduced.
- Before changing a production deployment, complete an inventory of deployed services, database volumes, backups, and live client route usage. If historic MongoDB or PostgreSQL data must move, use an idempotent, tenant-by-tenant migration with counts, relationship checks, sampled record comparison, rollback, and an explicit cutover window.

## Consequences

- New MongoDB collections need tenant-first compound indexes matching actual read patterns.
- Cross-tenant negative tests are a release gate for every route that accepts a resource identifier.
- The frontend must use the active API base URL for an entire workflow; it must not silently mix a local/demo data source with live records.
- Finance, attendance, assessments, and admissions are not production-ready merely because legacy engines or schemas exist. They require complete API, UI, audit, and integration tests before activation.
- The legacy service can be retired only after its active client dependencies and data have been migrated and verified.
