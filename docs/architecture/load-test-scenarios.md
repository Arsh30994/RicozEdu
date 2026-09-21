# Load-test scenarios (k6)

Targets: 10k authenticated concurrent sessions; 2–3k RPS burst; 3–5× spikes.

## Scenarios

| ID | Name | Shape | Pass criteria |
|----|------|-------|---------------|
| L1 | Steady interactive | 10k VUs, think-time, ~1k RPS | p95 read < 200 ms; error < 0.1% |
| L2 | Burst | Ramp to 2.5k RPS for 10 min | p95 < 300 ms; 429 only on limited routes |
| L3 | Spike 5× | 2 min at 12k RPS | Critical writes available; shed bulk |
| L4 | Registration surge | 80% writes to registration APIs | Idempotent; no duplicate rows |
| L5 | Result surge | Publish job + student poll | Job completes; poll served by replica/cache |
| L6 | Bulk notify | Enqueue 100k notifications | Queue lag within SLO; API p95 unaffected |
| L7 | Video upload | Signed URL + complete callback | API CPU flat; storage absorbs bytes |
| L8 | Mixed iOS/web | 70% web / 30% mobile headers | Same SLOs |
| L9 | Noisy neighbour | One tenant 10× quota | Other tenants unaffected |
| L10 | Chaos | Kill API pod / block Redis 60s | Recovery < 2 min; no corrupt writes |

## Commands

```bash
# From repo root with API up
k6 run loadtests/k6/steady.js
k6 run loadtests/k6/burst.js
k6 run loadtests/k6/spike.js
```

Set `BASE_URL`, `TENANT_ID`, and a pool of test JWTs via `TOKENS_FILE`.
