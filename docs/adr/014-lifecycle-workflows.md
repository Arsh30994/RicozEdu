# ADR-014: Command-driven student lifecycle workflows

## Decision

Student lifecycle processes (enquiry through ABC/NAD publication) run as explicit workflows: commands, validated state transitions, append-only transition history, audit events, and transactional outbox notifications. Controllers and SQL scripts must not mutate lifecycle state ad hoc.

## Consequences

- Idempotent commands with tenant-scoped keys
- Permission checked per workflow definition
- Queued work revalidates authorization_version / delegation
- Published academic results remain immutable; exam publish is a workflow step that never silent-overwrites
