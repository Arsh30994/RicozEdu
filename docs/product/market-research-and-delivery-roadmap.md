# RicozEdu Market Research and Delivery Roadmap

## Product position

RicozEdu is an education operating platform, not just a school-management interface. Its viable scope combines a student information system, administration ERP, learning-management workflows, and campus operations. The product should use one shared core while offering distinct School and Higher Education configurations.

This is the practical line between a coherent platform and an overbuilt launch: build a reliable student lifecycle first, then add the operational modules that depend on the same identity, enrollment, and academic-period data.

## Market evidence

### School market

School ERPs cluster the same daily workflows: admissions, student profiles, parent access, timetable, attendance, assessments, fee operations, communication, and exports. Fedena’s current feature set spans those operational modules as well as document, transport, library, payroll, mobile, and integration extensions. Teachmint similarly positions admissions, fee collection, attendance, and parent/staff communication as the core automation layer.

The implication for RicozEdu is not to copy every module. A school pilot must make one complete administrative journey faster: admit a student, establish guardian access, place the student in a grade and section, take attendance, publish a result, and communicate an update. Isolated screens do not compete with a working workflow.

### Higher-education market

Higher-education platforms treat the student record as a lifecycle that crosses recruiting, admissions, registration, records, advising, financial obligations, and completion. Ellucian presents this as an end-to-end student lifecycle rather than separate departmental applications. In India, the National Credit Framework and Academic Bank of Credits make explicit credit accumulation, transfer, and redemption important higher-education capabilities.

RicozEdu should therefore keep programme, course, term, curriculum, offering, registration, credits, results, and transcript records distinct. A school class roster and a university course registration are different business objects with different policies.

### Implementation lessons

EDUCAUSE research on ERP replacement identifies missing functionality, poor maintainability, cloud adoption, and integration as leading drivers. It also highlights that institutional transformation is operational work: data conversion, leadership, process mapping, integrations, training, and change management are as important as the software build. RicozEdu should package data import, migration validation, role-specific onboarding, and live operational reporting as product work, not deployment afterthoughts.

## Product decisions

| Decision | Rationale |
| --- | --- |
| One shared core, two academic domains | Shared identity, tenancy, documents, notifications, finance primitives, audit, and analytics; separate school and higher-ed models where workflows differ. |
| MongoDB active system of record | Matches the current product direction. The design uses a tenant field on every owned document and tenant-first compound indexes. |
| Modular monolith | Preserves simple deployment and clear module boundaries. Microservices, Kafka, and a marketplace are premature before the first pilots are stable. |
| API-first but workflow-led | APIs must support complete role workflows, not expose only database-shaped resources. |
| Privacy and authorization first | Student and child data needs explicit purpose, consent history, subject-rights handling, tenant isolation, and relationship-aware access. |
| AI as a bounded assistant | AI may summarize approved tenant data and assist learning, but it must cite its data, respect permissions, and never autonomously make admission, grading, discipline, or risk decisions. |

## Delivery sequence

### R0 Platform integrity

1. Establish one active API/runtime and document data ownership.
2. Maintain tenant isolation, role templates, additive permissions, audit events, secure sessions, and data-subject request handling.
3. Complete institution configuration, campuses, academic periods, school/higher-ed configuration, import/export preview, and explicit demo-data labels.
4. Add CI gates: type checks, unit tests, integration tests, tenant-swap authorization tests, API contract tests, and a production backup/restore exercise.

### R1 First pilot workflows

For a school pilot, ship admission to student profile, guardian link, grade/section enrollment, daily attendance, basic assessments/results, fee invoices/receipts, and parent communication.

For a higher-education pilot, ship admission to student profile, programme/curriculum/term, course offering, registration, attendance, marks/results, credit progression, and a student-facing schedule/record view.

The pilot should choose one of these flows as the first live workflow instead of releasing partial implementations of both at once.

### R2 Operational expansion

Add notifications with delivery tracking, assignments/submissions, timetable optimization, fee-provider reconciliation, role dashboards backed only by live data, mobile guardian/student journeys, and selected modules such as library, hostel, transport, or placements based on pilot demand.

### R3 Differentiation

Add source-grounded study assistance, teacher workflows, early-warning indicators reviewed by staff, natural-language reporting over authorized data, and approved Academic Bank of Credits or other official integrations.

## Explicit deferrals

Do not make facial recognition, biometric hardware control, automated high-stakes grading, emotion detection, an internal video-conferencing stack, a full accounting ERP, or autonomous government integrations part of the initial launch. They create privacy, operational, regulatory, or support commitments that do not help prove the core workflow.

## Security and data design requirements

- Scope every document, query, reference lookup, export, search index, and file access by the server-derived tenant context.
- Test object-ID swaps across two tenants for every read and write route. OWASP identifies this as broken object-level authorization risk.
- Use references for high-cardinality or many-to-many relationships such as guardian links, enrollments, course registrations, and attendance events; embed small, bounded value objects such as a student status history.
- Use tenant-first compound indexes for the list/search/filter paths actually supported by the UI. Do not create one collection per tenant.
- Store consent state as history, capture the purpose and notice version, make withdrawal as easy as consent, and maintain a restricted process for data-subject requests.
- Use a replica-set transaction or asynchronous worker with an explicit all-or-nothing policy for imports that exceed the synchronous, small-batch workflow.

## Sources

- [Fedena school ERP features](https://fedena.com/feature-tour)
- [Teachmint school ERP](https://www.teachmint.com/en-us/features/school-erp)
- [Ellucian Student lifecycle platform](https://www.ellucian.com/student)
- [UGC National Credit Framework](https://www.ugc.gov.in/pdfnews/9028476_Report-of-National-Credit-Framework.pdf)
- [EDUCAUSE ERP implementation research](https://www.educause.edu/ecar/research-publications/2023/more-than-going-live-achieving-institutional-transformation-through-erp-implementation/overview-of-the-current-state-of-erp-implementations)
- [MeitY Digital Personal Data Protection Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025%3B)
- [MongoDB multi-tenant architecture guidance](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/)
- [MongoDB embedding and references guidance](https://www.mongodb.com/docs/manual/data-modeling/embedding/)
- [OWASP REST authorization testing guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Assessment_Cheat_Sheet.html)
