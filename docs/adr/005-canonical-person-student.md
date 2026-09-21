# ADR-005: Canonical Person + StudentMembership

## Decision
One global persons row per human. Authoritative per-tenant student record is student_memberships. No giant student table; academics FK to student_memberships.

## Consequences
No duplicate student identities across admissions/LMS/fees later.
