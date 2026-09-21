# Academics — versioned curriculum & rules engine

## Data model (summary)

See migration `infra/migrations/003_academic_curriculum_rules.up.sql`.

Hierarchy: Academic year ? Term ? Programme ? **Programme version** ? **Curriculum version** ? Course groups / requirements ? **Course versions**.

Also: prerequisites (AND/OR groups), co-requisites, equivalencies, waivers, transfer credits, progression rules, exit awards, OBE CO-PO-PSO, ABC credit ledger, course attempts, rule evaluation decisions, curriculum simulations, cohorts + programme enrolments (pinned to programme/curriculum versions).

## Rule format

Declarative JSON (`RuleDocument` v1) in `@ricozedu/shared-types`:

```json
{
  "version": "1",
  "all": [
    { "type": "credit_total", "min": 120 },
    { "type": "group_credits", "courseGroupId": "...", "minCredits": 12 }
  ],
  "any": [
    { "type": "course_completed", "courseVersionId": "..." }
  ]
}
```

Node types: `credit_total`, `course_completed`, `group_credits`, `prerequisite_satisfied`, `term_standing`, `exit_eligible`, nested `all` / `any` / `not`.

## Immutability

Published `programme_versions` / `curriculum_versions` cannot change rules/document content (DB triggers). New effective-dated versions supersede.

## Cohort migration strategy

1. Cohorts and `programme_enrolments` pin `programme_version_id` (+ optional `curriculum_version_id`).
2. Publishing a new version does **not** move existing cohorts.
3. Opt-in migration: create a proposal enrolment / admin job that lists affected students via simulation, requires explicit approval, writes audit `cohort.migration_proposed` / `cohort.migration_applied`.
4. Never silently recalculate published results; ABC ledger is append-only.

## Audit events

- `programme_version.created` / `programme_version.published`
- `curriculum_version.published`
- `registration.check.passed` / `registration.check.failed`
- Decisions persisted in `rule_evaluation_decisions` with `rule_version_refs` including `evaluatorVersion`

## APIs

- `POST /v1/academics/programme-versions`
- `POST /v1/academics/programme-versions/:id/publish` (simulation + cycle check)
- `POST /v1/academics/curriculum-versions/:id/publish`
- `POST /v1/academics/registration/check` (human-language explanation)
- `GET /v1/academics/progress?studentMembershipId=&programmeEnrolmentId=`
