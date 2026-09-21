# ADR-013: Declarative academic rules

## Decision

Academic progression, exit, and credit rules are stored as versioned JSON documents and evaluated by a shared pure evaluator (`ricozedu-rules-v1`). Hardcoded conditionals in controllers are forbidden for eligibility.

## Consequences

- Programme/curriculum versions publish immutably with effective dates.
- Every decision stores `rule_version_refs` + human `explanation`.
- Simulation runs before publish to show affected students.
- Prerequisite graphs validated for cycles; cross-department edges allowed.
