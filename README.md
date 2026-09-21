# RicozEdu

Multi-tenant education operating system (Phase 0 foundation).

## Stack

- NestJS API (`apps/api`)
- Next.js / React Native placeholders (pending)
- PostgreSQL + FORCE RLS, Redis
- pnpm + Turborepo monorepo

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis
npx pnpm install
npx pnpm migrate
npx pnpm --filter @ricozedu/api dev
```

Bootstrap a tenant with `POST /v1/tenants` and header `X-Bootstrap-Token`.

## Docs

- ADRs: `docs/adr/`
- DB model review: `docs/database/identity-academic-model-REVIEW.md`
- Authz security: `docs/security/identity-authorization.md`
- Threat model: `docs/threat-model/phase0.md`
