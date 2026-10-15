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
