# RicozEdu

**RicozEdu** is a multi-tenant education operating system for institutions, administrators, faculty, and learners. It combines an administration console, secure workspace-based access, student lifecycle management, curriculum and degree-progress foundations, and an AI learning workspace for grounded study support.

> **Project status:** The default local runtime is the Express + MongoDB service, which currently powers authentication, workspaces, student management, and dashboard data. The original NestJS + PostgreSQL/Redis service remains in the repository as the **legacy academic and AI runtime** while those domains are migrated. This README distinguishes the two so the current implementation is clear.

## What RicozEdu does

### Administration console

The Next.js console provides a modern, responsive workspace for education administrators:

- Login and workspace selection
- Dashboard overview and recent activity
- Institution, department, people, student, user/role, and audit-log screens
- Search across console records
- Student creation, filtering, and controlled status changes
- Dark and light modes, accessible controls, and motion that respects reduced-motion settings

### Multi-tenant student operations

The active Express API uses MongoDB and provides these working vertical slices:

- Secure tenant/workspace bootstrap with a one-time bootstrap token
- Password login, short-lived JWT access tokens, rotating refresh tokens, and logout
- Active membership lookup and workspace selection through `X-Tenant-Id`
- Role-aware access for `owner`, `admin`, `faculty`, and `student`
- Tenant-scoped student list, search, detail, creation, dashboard summary, and lifecycle status transitions
- Structured errors, correlation IDs, CORS allow-listing, Helmet security headers, and rate limits on login and bootstrap routes
- Audit events for tenant bootstrap, authentication, and student changes

### Academic and AI foundations (legacy runtime)

The NestJS/PostgreSQL implementation is retained for the domains still being migrated. It contains:

- Tenant-aware authorization, permission checks, request context, audit trail, idempotency, and outbox patterns
- Curriculum and programme versioning, prerequisite validation, registration-eligibility explanations, and degree-progress evaluation
- PostgreSQL row-level security (RLS) and Redis-backed infrastructure
- Ricoz AI: approved-document ingestion, source-backed chat, chat history, voice interaction hooks, read-only academic-agent tools, and a source-aware Study Companion
- Optional Groq-powered grounded responses and revision plans, plus OmniDimension voice-agent sessions

The web UI includes `/assistant` and `/study` screens for those AI capabilities. They require the NestJS legacy API to be running until their routes are migrated into Express.

## Architecture

```text
apps/
├── web/       Next.js 14 administration console and AI/study UI
├── api/       Express + MongoDB active API, plus NestJS legacy modules
└── mobile/    Expo learner app (initial sign-in, workspace, and profile slice)

packages/
├── shared-auth/   permission constants and access-token types
├── shared-types/  validation and shared academic rule types
└── tsconfig/      shared TypeScript configuration

infra/
├── migrations/    PostgreSQL legacy-schema migrations
└── docker/        local database initialization assets
```

| Layer | Default technology | Responsibility |
| --- | --- | --- |
| Web | Next.js + React | Administration console, AI/study interfaces, browser voice controls |
| Active API | Express 5 + Mongoose | Login, memberships, tenant context, students, dashboard summary |
| Active database | MongoDB 7 | Users, tenants, memberships, refresh tokens, students, audit events |
| Legacy API | NestJS + TypeScript | Academic rules, RLS-protected records, AI knowledge and study services |
| Legacy infrastructure | PostgreSQL 16 + Redis 7 | Curriculum data, tenant isolation, migrations, asynchronous patterns |
| Mobile | Expo + React Native | Learner sign-in and workspace/profile experience (in progress) |

## Quick start: active Express + MongoDB application

### Prerequisites

- Node.js 22 or newer
- pnpm 9
- Docker Desktop (for MongoDB)

### 1. Configure local environment

```powershell
Copy-Item .env.example .env
```

On macOS or Linux, use `cp .env.example .env`. Update the local development values in `.env`; never commit that file.

At minimum, set secure values for:

```dotenv
MONGODB_URI=mongodb://localhost:27017/ricozedu
JWT_ACCESS_SECRET=replace-with-a-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-a-second-secret-of-at-least-32-characters
BOOTSTRAP_ADMIN_TOKEN=replace-with-a-private-bootstrap-token
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 2. Install and start services

```sh
pnpm install
docker compose up -d mongodb
pnpm dev
```

Open:

- Web console: <http://localhost:3000>
- Express API: <http://localhost:4000>
- Health check: <http://localhost:4000/health>

### 3. Bootstrap the first workspace

Bootstrap is intentionally protected by `X-Bootstrap-Token`. Run this once with your private value from `.env`:

```sh
curl -X POST http://localhost:4000/v1/tenants \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: YOUR_PRIVATE_BOOTSTRAP_TOKEN" \
  -d '{
    "name": "Demo Institute",
    "slug": "demo-institute",
    "adminName": "Admin User",
    "adminEmail": "admin@example.edu",
    "adminPassword": "a-long-unique-password"
  }'
```

The response includes the tenant ID. Sign in with the administrator credentials, retrieve memberships, and send the selected tenant ID in the `X-Tenant-Id` header for workspace-scoped routes.

## Active API reference

All non-public workspace routes require `Authorization: Bearer <access-token>` and `X-Tenant-Id: <tenant-id>`.

| Method | Endpoint | Description | Access |
| --- | --- | --- | --- |
| `GET` | `/health` | API and MongoDB connection status | Public |
| `POST` | `/v1/tenants` | Create the first tenant and owner | Bootstrap token + rate limit |
| `POST` | `/v1/auth/login` | Sign in and receive access/refresh tokens | Public + rate limit |
| `POST` | `/v1/auth/refresh` | Rotate a refresh token | Public |
| `POST` | `/v1/auth/logout` | Revoke a refresh token | Public |
| `GET` | `/v1/me/memberships` | List the signed-in user's active workspaces | Authenticated |
| `GET` | `/v1/tenants/current` | Read selected workspace and membership role | Authenticated + tenant member |
| `GET` | `/v1/dashboard/summary` | Student counts and latest activity | Owner, admin, faculty |
| `GET` | `/v1/students` | Search/filter tenant-scoped student records | Tenant member; students only see their own record |
| `POST` | `/v1/students` | Create a student record | Owner, admin, faculty |
| `GET` | `/v1/students/:id` | Read a single student record | Tenant member; student scope enforced |
| `PATCH` | `/v1/students/:id/status` | Perform an allowed lifecycle status transition | Owner, admin, faculty |

Request bodies cannot choose a tenant. The server derives tenant context from the authenticated membership and `X-Tenant-Id`, preventing cross-workspace writes through a client-supplied `tenantId` field.

## Authentication and tenancy

1. A user signs in with email and password.
2. The API returns a short-lived access token and rotating refresh token.
3. The client asks for active memberships using `GET /v1/me/memberships`.
4. The client selects one workspace and includes its ID in `X-Tenant-Id`.
5. Middleware verifies the token, confirms active tenant membership, resolves the role, and scopes all student queries to that tenant.

Refresh-token reuse is detected: when a revoked token is reused, the token family is revoked and the user's authorization version is increased, invalidating existing access tokens.

## AI learning workspace

Ricoz AI is designed to be useful without inventing institutional facts.

- Authorized staff upload approved PDF, TXT, or Markdown material.
- Documents are parsed, chunked, tenant-scoped, and retrieved as evidence for answers.
- The chat UI shows sources and identifies evidence-only responses when an AI provider is unavailable.
- The academic agent can only invoke bounded, read-only services for degree progress and registration eligibility; it cannot run SQL, shell commands, arbitrary URLs, or write academic data.
- The Study Companion creates source-linked flashcards, quizzes, and revision plans. These are learning aids, not official assessment material.
- Browser speech recognition and speech synthesis provide a lightweight typed/voice experience. Optional provider-backed transcription and OmniDimension voice sessions are configured only on the server.

### Optional AI configuration

Keep provider keys server-side. Do **not** use a `NEXT_PUBLIC_` prefix for secrets.

```dotenv
# Safe default: evidence-only behavior
AI_PROVIDER=disabled

# Optional Groq integration for grounded generation and study plans
AI_PROVIDER=groq
GROQ_API_KEY=your-server-side-key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo

# Optional OmniDimension browser voice agent
OMNIDIM_API_KEY=your-server-side-key
OMNIDIM_AGENT_ID=your-numeric-agent-id
```

See [AI_USAGE.md](AI_USAGE.md) and [docs/testing/ai-learning.md](docs/testing/ai-learning.md) for data handling, limits, and verification guidance.

## Running the legacy academic and AI service

The legacy runtime requires PostgreSQL and Redis in addition to MongoDB. It exposes the NestJS academic and AI routes used by the richer AI interface.

```sh
docker compose --profile legacy up -d postgres redis
pnpm --filter @ricozedu/api migrate
pnpm --filter @ricozedu/api dev:legacy
```

The Express and NestJS API servers both default to port `4000`; run only one at a time or set a different `API_PORT` for one of them. The legacy database URLs in `.env.example` are development placeholders—replace them with secure credentials outside local development.

## Mobile application

`apps/mobile` is an Expo/React Native learner experience. Its first implementation includes:

- Secure refresh-token storage with `expo-secure-store`
- Sign-in and workspace selection
- Learner profile and student-list integration with the active Express API

Run it separately after the API is available:

```sh
pnpm --filter @ricozedu/mobile start
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an address reachable from the simulator or device. See [apps/mobile/README.md](apps/mobile/README.md) for Android emulator, iOS simulator, and physical-device notes.

## Quality checks

Run the checks that match the runtime you changed:

```sh
# Shared packages and the active applications
pnpm --filter @ricozedu/shared-auth build
pnpm --filter @ricozedu/shared-types build
pnpm --filter @ricozedu/api typecheck
pnpm --filter @ricozedu/web typecheck
pnpm --filter @ricozedu/api test

# Legacy AI safeguards
pnpm --filter @ricozedu/api test -- ai.service.spec.ts
```

The Express API has focused tests for health and request validation. The legacy academic modules include rule-engine, lifecycle, fee-allocation, webhook, permission, and AI safeguard tests. Integration tests need their required local services and configuration.

## Security notes

- Store passwords with Argon2; never log or expose password hashes, access tokens, refresh tokens, or provider keys.
- Use HTTPS and secure secret management outside local development.
- Restrict `CORS_ORIGINS` to the deployed web and mobile origins.
- Treat uploaded documents and AI prompts as untrusted input.
- Apply file-size and file-type limits for knowledge uploads.
- Keep tenant context server-derived; never trust `tenantId` in a request body.
- Review migrations and back up data before applying them outside local development.

## Documentation

- [AI usage and safety](AI_USAGE.md)
- [AI verification checklist](docs/testing/ai-learning.md)
- [Architecture decisions](docs/adr/)
- [Identity and authorization controls](docs/security/identity-authorization.md)
- [Threat model](docs/threat-model/phase0.md)
- [Academic curriculum domain](docs/domains/academics-curriculum.md)
- [Student lifecycle workflows](docs/domains/student-lifecycle-workflows.md)
- [Database model review](docs/database/identity-academic-model-REVIEW.md)
- [Master test plan](docs/testing/master-test-plan.md)

## Roadmap

The next technical milestone is completing the migration of the academic and AI routes into the active Express/MongoDB runtime, then extending the mobile app with academic progress and the AI study experience. Until then, the runtime split described above should be treated as an intentional transition boundary, not as a production-ready unified deployment.
