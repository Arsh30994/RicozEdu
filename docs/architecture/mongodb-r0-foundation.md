# MongoDB R0 foundation

RicozEdu now treats MongoDB as the active operational datastore. The PostgreSQL starter schema is retained as a domain-reference artifact for the legacy service; it is not a migration source for the Express API.

## Tenant boundary

Every institution-owned collection contains `tenantId`, and every route derives it from the authenticated member's `X-Tenant-Id` header. Request bodies cannot supply a tenant identifier. The API validates the target tenant, active membership, role, and any additive permissions before it reads or writes tenant-owned data.

Compound indexes enforce tenant-local uniqueness for campus codes, school grades, school sections, departments, programmes, courses, academic periods, and student numbers. Reference fields are additionally checked against the selected tenant before creating a linked record.

## Domain mapping

| Logical domain | MongoDB collection | Notes |
| --- | --- | --- |
| Institution | `RicozTenant` | Name, immutable institution type, timezone, status |
| Campus and academic period | `RicozCampus`, `RicozAcademicPeriod` | Periods are scoped to an active campus |
| School configuration | `RicozSchoolGrade`, `RicozSchoolSection` | Available only to `school` tenants |
| Higher-ed configuration | `RicozDepartment`, `RicozProgramme`, `RicozCourse` | Available only to `higher_ed` tenants |
| Identity and access | `RicozUser`, `RicozMembership` | Global users; tenant-local role and optional additive permissions |
| Student operations | `RicozStudent` | Existing lifecycle model, with tenant-scoped import/export |
| Privacy | `RicozConsentRecord`, `RicozPrivacyRequest` | Append-only consent history and resolution workflow |
| Import resilience | `RicozImportJob` | Preview results, validation issues, idempotent previews, stale-job protection |
| Audit | `RicozAuditEvent` | Actor, tenant, resource, action, correlation ID |

School and higher-education structures deliberately remain separate. A grade/section is not treated as a programme/course, even though both are tenant-scoped academic configuration.

## R0 API capabilities

- Institution configuration and campus setup
- Academic periods for a campus
- School grades and sections, or higher-ed departments, programmes, and courses
- Tenant-local role catalogue and membership permissions
- Student CSV preview, validation feedback, idempotent job creation, guarded commit, and CSV export
- Consent evidence and data-subject request tracking for student and user subjects

CSV is the active import transport in this release. XLSX ingestion will use a dedicated, tested workbook parser in the next import increment rather than treating a spreadsheet as untrusted CSV text.

## Operating notes

Create indexes during deployment before accepting production traffic. For large imports, move commit processing to a worker and use a MongoDB replica set transaction or another explicit all-or-nothing strategy. The current HTTP workflow limits imports to 1,000 rows and refuses a stale preview rather than silently producing a partial result.
