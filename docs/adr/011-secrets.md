# ADR-011: Secrets outside source

## Decision
Secrets only via environment / secret manager. Never commit .env. Never log passwords, tokens, or sensitive PII.

## Consequences
Requires .env.example and CI secret hygiene.
