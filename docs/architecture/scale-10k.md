# RicozEdu scale design — 10,000 concurrent users

RicozEdu does **not** equate concurrent users with database connections. Sessions live in JWT + Redis; Postgres only sees active queries through PgBouncer.

## Traffic model

| Signal | Steady | Burst | Spike (3–5×) |
|--------|--------|-------|--------------|
| Authenticated concurrent users | 10,000 | 10,000 | 10,000 (same sessions, hotter RPS) |
| API RPS | 800–1,200 | 2,000–3,000 | 6,000–15,000 (short, ?2–5 min) |
| Write share | ~15% | ~25% (registration) | ~40% (results publish + registration) |
| Read share | ~85% | ~75% | ~60% |

**Surge classes**

1. Registration surges — critical writes + idempotency + rate limits.
2. Examination-result surges — async publish jobs; reads via replicas + CDN for static artifacts.
3. Bulk notifications — dedicated queue priority, never on critical write path.
4. Video uploads — object storage direct/signed; API only orchestrates.
5. iOS + web — same API; CDN for web assets; APNs/FCM off critical path.

## Separate paths

| Path | Entry | Store / queue | SLO class |
|------|-------|---------------|-----------|
| Critical writes | API ? PgBouncer **transaction** ? primary | Sync TX + outbox | Critical |
| Normal reads | API ? read pool ? replica (fallback primary) | Redis cache | Interactive |
| Bulk reports | API enqueue ? `q:reports` workers ? replica / warehouse | Async | Batch |
| Notifications | Outbox / `q:notify:{priority}` ? providers | Async | Best-effort |
| Video processing | Signed upload ? object storage ? `q:media` | Async | Batch |
| AI jobs | `q:ai` (lowest priority) | Async | Best-effort |
| External integrations | `q:external` + circuit breaker | Async + retry | Degraded OK |

## Capacity model (baseline for 10k concurrent)

Assumptions: p50 request 40 ms CPU, p95 120 ms; 40% of RPS hits app compute; Node event-loop + Nest.

| Layer | Sizing |
|-------|--------|
| API pods | 12–20 × 2 vCPU / 4 GiB (burst HPA to 40) |
| Workers (notify/media/reports) | 6–12 pods, separate deployments |
| Redis | Primary + replica, ?8 GiB; cluster if >50k ops/s |
| Postgres primary | 8–16 vCPU, 64–128 GiB RAM; `max_connections?400` |
| Read replicas | 2× (steady), 3–4× during result windows |
| PgBouncer | 2–3 nodes, `transaction` mode for app; `session` only for migrator/admin |
| Object storage | Unlimited; multipart; CDN in front of public assets |
| Search | Separate OpenSearch/ES cluster; async indexer from outbox |
| Analytics warehouse | CDC / nightly ETL; **never** query warehouse from request path |

Concurrent users ? 10k does **not** mean 10k DB connections. See [connection-budget.md](./connection-budget.md).

## Cache strategy

| Key pattern | TTL | Invalidation |
|-------------|-----|--------------|
| `perm:{tenant}:{user}:{av}` | 60–300s | AV bump / SensitiveAuthz bypass |
| `rl:{tenant}:{route}:{window}` | window length | Natural expiry |
| `entity:{tenant}:{type}:{id}` | 30–120s | Write path `DEL` + outbox |
| CDN static (web, HLS segments, public docs) | hours | Versioned URLs / purge on publish |
| Idempotency results | hours | Key TTL |

Rules: never cache published grades as mutable; never cache decrypted APAAR/push tokens; fail-open on Redis for reads that have DB fallback; fail-closed for rate limits when Redis down (optional env `RATE_LIMIT_FAIL_CLOSED=1`).

## Queue strategy

Streams / queues (Redis Streams or broker-backed):

| Queue | Priority | Concurrency | Backpressure |
|-------|----------|-------------|--------------|
| `q:critical` | P0 | Low, reserved | Reject overload at edge (429) |
| `q:default` | P1 | Medium | Delay + retry |
| `q:notify.high` | P1 | Medium | Token cleanup on unregistered |
| `q:notify.bulk` | P2 | High, rate-shaped | Drop to delayed when lag > SLO |
| `q:media` | P2 | CPU/GPU bound | Pause admissions when lag high |
| `q:reports` | P3 | Low | Run off-peak |
| `q:ai` | P4 | Lowest | Shed first |
| `q:external` | P2 | Circuit-broken | Open circuit ? dead-letter |

Backpressure: worker lag metrics ? HPA + API returns `503`/`429` for shedable classes only; critical writes stay available until DB saturation.

## Autoscaling signals

| Component | Scale on |
|-----------|----------|
| API | RPS, p95 latency, event-loop lag, CPU, in-flight requests |
| Workers | Queue depth, oldest-message age, processing rate |
| Read replicas | Replica lag, read QPS, CPU |
| PgBouncer | Client wait, server connection use |
| Redis | Memory, ops/s, blocked clients |

Do **not** scale API solely on concurrent WebSocket/session count.

## SLOs

| Class | Availability | Latency | Notes |
|-------|--------------|---------|-------|
| Auth / critical writes | 99.9% monthly | p95 ? 300 ms | Exclude client errors |
| Interactive reads | 99.5% | p95 ? 200 ms | Cache-friendly |
| Result publication job | 99.9% completion | Batch ? 30 min for 50k rows | Async |
| Notifications | 99% deliver attempt | p95 enqueue ? 2s | Provider SLAs separate |
| Media pipeline | 99% | Upload ACK ? 2s; transcode best-effort | |

Error budget: burn alerts on multi-window (1h / 6h).

## Failure modes & recovery

| Failure | Detection | Behavior | Recovery |
|---------|-----------|----------|----------|
| API pod crash | LB health | Drain via graceful shutdown | K8s restart |
| Primary PG down | Ready probe fail | Writes 503; reads may continue on replica if configured | Failover / promote |
| Replica lag > threshold | Metric | Fall back to primary for strong-read routes only | Catch-up |
| Redis down | Ready / circuit | Cache miss; rate-limit fail-open or closed per config | Restore |
| Queue backlog | Lag SLO | Shed P3–P4; protect P0 | Scale workers |
| APNs 410 | Provider | Invalidate token | Client re-register |
| Provider auth expired | 403 | Refresh JWT once; stop on InvalidProviderToken | Rotate secrets |
| Noisy neighbour tenant | Rate limit / quota | 429 for that tenant | Raise quota manually |
| WAF / CDN outage | Synthetic | Origin still serves API if DNS allows | Bypass plan |

Graceful shutdown: stop ready ? finish in-flight (?30s) ? close pools ? exit.

## Load-test scenarios

See `loadtests/k6/` and [load-test-scenarios.md](./load-test-scenarios.md).

## Infrastructure

See `infra/scale/` — PgBouncer, Redis, edge (CDN/WAF/LB), compose overlay, HPA sketches.
