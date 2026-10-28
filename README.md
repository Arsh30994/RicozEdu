# RicozEdu

Multi-tenant education operating system.

## Stack

- Next.js web application (`apps/web`)
- Express API with MongoDB (`apps/api`)
- PostgreSQL/Redis services and NestJS modules remain available under the `legacy` Compose profile while remaining workflows are migrated.
- pnpm + Turborepo monorepo

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose up -d mongodb
pnpm dev
```

The web app is available at `http://localhost:3000`; the Express API is at `http://localhost:4000`.
Create the first workspace and administrator using `POST /v1/tenants` with the `X-Bootstrap-Token`
header. The JSON body requires `name`, `slug`, `adminName`, `adminEmail`, and `adminPassword`.

The migrated API includes bootstrap, login, refresh/logout, tenant membership and authorization,
student listing/creation/status transitions, tenant-scoped dashboard counts, request validation,
rate limits, correlation IDs, and health checks. Student and dashboard endpoints require a bearer
access token plus `X-Tenant-Id`; management operations require an owner, admin, or faculty membership.

To run the remaining PostgreSQL-backed legacy API and migrations during the staged migration, use
`docker compose --profile legacy up` and the `dev:legacy`, `start:legacy`, or migration scripts.

## AI assistant and voice agent

The chat assistant uses approved course material and authorized academic tools. For full-duplex voice, configure `OMNIDIM_API_KEY` and the numeric `OMNIDIM_AGENT_ID` in the API server environment. Do not expose the API key in a `NEXT_PUBLIC_` variable. The browser receives only the short-lived session URL.

The Study companion can generate syllabus-aware revision plans from selected approved documents. Configure `AI_PROVIDER=groq` and `GROQ_API_KEY` in the API server environment to enable AI planning. Learners can provide a target date, available minutes per day, typical minutes per topic, and syllabus completion percentage; plans are saved as study artifacts and cite their source documents. The planner returns an explicit error if the AI provider is unavailable rather than creating a generic schedule.

OmniDimension session creation does not accept an agent instruction prompt. Configure the selected agent in the OmniDimension dashboard using its [conversation-flow guide](https://docs.omnidim.io/docs/dashboard-guides/configure-your-agent). Suggested static welcome message:

> I’m your study helper. Ask me whatever you want.

Suggested agent instructions:

> You are RicozEdu’s friendly study helper. Help learners understand academic topics by explaining concepts, summarizing supplied course material, creating practice questions, and planning revision. Keep spoken replies warm, natural, and concise; explain step by step when useful and ask one focused follow-up question when a request is unclear. Stay focused on learning. If asked for something unrelated, briefly explain that your role is study support and guide the learner back to an educational question. Never invent institution-specific policies, grades, deadlines, fees, or account details; say when you cannot verify them and direct the learner to approved material or staff. Do not claim access to files or student records unless an authorized source provides them, and never ask for passwords or sensitive personal information.

## Docs

- ADRs: `docs/adr/`
- DB model review: `docs/database/identity-academic-model-REVIEW.md`
- Authz security: `docs/security/identity-authorization.md`
- Threat model: `docs/threat-model/phase0.md`
