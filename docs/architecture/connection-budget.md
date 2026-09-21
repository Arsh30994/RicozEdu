# Connection budget (10k concurrent users)

**Rule:** concurrent users ? Postgres connections.

## User ? connection math

| Layer | Count | Notes |
|-------|------:|-------|
| Authenticated concurrent users | 10,000 | JWT; idle users hold **0** DB conns |
| Peak RPS | 3,000 | Burst |
| Avg DB queries / request | 2–4 | With cache hits lower |
| Peak DB queries / s | ~6,000–12,000 | Short spikes higher |
| Target query time | 2–10 ms | Indexed OLTP |

Connections needed ? `(in_flight_queries)`. At 3k RPS × 8 ms avg query = ~24 concurrent queries **globally** if perfectly efficient; real amplification (TX, RLS, joins) ? budget **hundreds**, not thousands.

## Postgres

| Setting | Value | Rationale |
|---------|------:|-----------|
| `max_connections` | 400 | Leave headroom for admin/replica slots |
| Reserved superuser | 3 | |
| App via PgBouncer | ? 120 server conns to primary | Transaction pooling |
| Read replica server conns | ? 80 per replica | |
| Migrator / admin | Session pool, ? 10 | Never through app pool |

## PgBouncer (per node)

| Pool | Mode | `default_pool_size` | `max_client_conn` |
|------|------|--------------------:|------------------:|
| `ricoz_app` (write) | transaction | 40 | 5,000 |
| `ricoz_app_ro` (read) | transaction | 30 | 5,000 |
| `ricoz_migrator` | session | 5 | 50 |

Deploy 2–3 PgBouncer nodes behind LB; total server conns to primary = sum of pool sizes ? 120.

## Application pools (per API pod)

| Pool | `max` | Formula |
|------|------:|---------|
| Write (`DATABASE_URL` ? pgbouncer write) | 8–12 | pods × max ? bouncer server budget |
| Read (`DATABASE_READ_URL` ? pgbouncer read) | 8–16 | |
| Migrator (API migrate job only) | 2 | Not in request path |

Example: 20 API pods × 10 write = 200 **client** connections to PgBouncer, mapped to ~40–80 **server** connections on primary.

## Redis

| Use | Budget |
|-----|--------|
| Connections per API pod | 1–2 (commands) + 1 (optional subscriber) |
| Workers | 1–2 each |
| Avoid | New connection per request |

## Object storage / search / warehouse

No Postgres coupling. Uploads use signed URLs (API connection released immediately). Search/warehouse ingest from queues/CDC only.
