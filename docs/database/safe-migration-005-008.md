# Safe migration design — Deploy domain schemas 005–008

**Assumed change (`[CHANGE]` unspecified):** Apply `005_assessment_examination`, `006_student_fees_payments`, `007_video_resources`, `008_notifications` (including webhook RLS hardening + revaluation integrity trigger + finance/media permission seeds) to environments already on **001–004** / app release `2487ab8`.

**Nature:** Mostly **expand-only** (new tables, indexes, functions, permissions). No rewrite of published grades, payment captures, or person identities. Compatible with **old app binary** during a short window if new tables are unused until feature flags flip.

**Do not** treat this as a license to mutate `published_*` results or replay payment webhooks during backfill.

---

## 0. Principles mapped to this change

| Requirement | Approach |
|-------------|----------|
| Backward-compatible deploy | Expand first (DDL add-only) ? deploy app that *optionally* uses new tables ? enable modules per tenant ? contract unused drafts later |
| Expand-and-contract | Contract phase only drops obsolete *draft* helpers if any; **never** drop ledger/receipt/result tables in contract |
| No long peak locks | `CREATE TABLE`, `CREATE INDEX CONCURRENTLY` where indexes added on hot existing tables; avoid `ALTER` on large live tables in this package (new tables only) |
| Rollback / forward-fix | Prefer forward-fix; down scripts exist for empty/new envs, not for prod with tenant data |
| Preserve data | No UPDATEs of academic published rows or payment allocations in migration SQL |
| Tenant rollout | Schema global; **feature flags / permission grants** per tenant |
| No published academic loss | Migrations create new result tables; do not DELETE/UPDATE existing curriculum published versions |
| No payment duplication | No backfill that re-inserts captures; webhook unique `(provider, event_id)` |
| No identity duplication | No person/user backfill in this package |

---

## 1. Pre-migration checks

### Backup
- [ ] Take **Postgres logical backup** or snapshot (PITR base + WAL) of primary; verify restore in staging within last 30 days drill.
- [ ] Record backup ID, RPO timestamp, operator, ticket.
- [ ] Snapshot Redis only if outbox/cache critical (optional; rebuildable).

### Inventory
```sql
-- Schema version
SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at; -- or your migrate ledger

-- Row counts / existence of prerequisites
SELECT to_regclass('ricoz.tenants'),
       to_regclass('ricoz.student_memberships'),
       to_regclass('ricoz.course_attempts'),
       to_regclass('ricoz.examination_cycles'),
       to_regclass('ricoz.abc_credit_ledger'),
       to_regclass('ricoz.learning_outcomes');

-- Confirm target objects absent (idempotent check)
SELECT to_regclass('ricoz.mark_entries'),
       to_regclass('ricoz.payment_intents'),
       to_regclass('ricoz.video_resources'),
       to_regclass('ricoz.device_push_tokens');
```

### Compatibility
- [ ] App build still points at 001–004 APIs (Academics/Lifecycle); new modules **not** registered or behind `FEATURE_*=false`.
- [ ] `ricoz_app` / `ricoz_migrator` roles exist; FORCE RLS helpers present (`tenant_id_from_setting`).
- [ ] No open long transactions; replication lag &lt; threshold.
- [ ] Maintenance window or off-peak for index builds if any CONCURRENTLY needed on shared tables (this package: prefer none on hot tables).

### Risk gates
- [ ] Staging migrated with production-sized synthetic tenants.
- [ ] Hostile-review follow-ups present in 005/006 SQL (webhook DEFINER, revaluation trigger).
- [ ] Rollback owner + academic registrar + finance on-call named.

---

## 2. Migration steps

### Phase A — Expand (schema)

1. **Announce** migration start metric `migration_005_008_phase=expand_start`.
2. Run as **`ricoz_migrator`** (bypasses RLS), `statement_timeout` raised carefully (e.g. 15–30 min), `lock_timeout` set (e.g. 5s) with retry:
   ```text
   migrate up 005 ? 006 ? 007 ? 008
   ```
3. Order matters: 005 (assessment) before any future FKs from fees to results; 006 fees; 007 video; 008 notifications + permission seeds.
4. After each file: verify `to_regclass` + RLS enabled+forced on new tenant tables.
5. **Do not** enable public webhook routes or payment capture workers yet.

### Phase B — App expand (code)

1. Deploy API that includes engines **but** does not mount fees/assessment/video/notification controllers *or* mounts them behind flags default **off**.
2. Health/ready unchanged; no dual-write required (greenfield tables).

### Phase C — Tenant enablement (data / config, not DDL)

1. Grant finance/media/notification permissions to roles **per tenant** as needed.
2. Insert tenant-scoped `payment_provider_configs` / templates only when that tenant goes live.
3. Flip `modules.fees|assessment|video|notifications` flags per tenant.

### Phase D — Contract (later, optional)

1. Only after ?1 release and no rollback need: remove dead feature flags, unused draft columns if introduced later.
2. **Never** contract-drop `published_course_results`, `payment_*` ledgers, `device_push_tokens` ciphertext.

**Dual-read / dual-write:** **Not justified** for this change (new tables, no column rename of live entities). Skip.

---

## 3. Compatibility window

| Time | Old app (2487ab8) | New app (flags off) | New app (tenant flag on) |
|------|-------------------|---------------------|---------------------------|
| After Phase A only | ? Safe — ignores new tables | ? Safe | N/A |
| After Phase B | ? Safe | ? Safe | N/A |
| After Phase C for tenant T | ? Safe for other tenants | ? | ? T uses new paths |

**Minimum window:** Keep old app deployable until Phase C has zero critical incidents for 72h on pilot tenants.

**Breaking if:** App released that *requires* 005–008 tables without migration applied — forbid via migrate-gate in CI/CD.

---

## 4. Backfill strategy

| Data | Strategy |
|------|----------|
| Assessment / marks | **No backfill** — start empty; import tools later with idempotency keys |
| Fee structures | Optional CSV per tenant via admin API after flag on; dry-run validate sums |
| Historical payments | **Do not** invent intents from bank files without reconciliation job + unique provider IDs |
| Video | No backfill |
| Push tokens | Devices re-register on next app open |
| Permissions | Seed codes in 008; **role_permissions** backfill via explicit script per tenant (not blanket TenantAdmin auto-grant in prod without review) |

If a tenant needs opening balances for fees:

1. Create `student_fee_accounts` + `fee_charges` in a **single TX per student**.
2. Idempotency key `fee_open_balance:{tenant}:{membership}:{structure}`.
3. Never create `payment_intents` status=`captured` without provider id + receipt.

---

## 5. Validation queries

```sql
-- A. All new tenant tables have RLS forced
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'ricoz'
  AND c.relname IN (
    'mark_entries','payment_intents','payment_webhook_inbox',
    'video_resources','device_push_tokens','notification_deliveries'
  );

-- B. Webhook inbox policy must NOT allow NULL tenant to ricoz_app
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'ricoz.payment_webhook_inbox'::regclass;

-- C. Revaluation trigger exists
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'ricoz.revaluation_requests'::regclass
  AND tgname = 'trg_revaluation_student_match';

-- D. Permission seeds
SELECT code FROM ricoz.permissions
WHERE code LIKE 'finance.%' OR code LIKE 'media.%' OR code LIKE 'notification.%';

-- E. No duplicate provider events possible
SELECT indexdef FROM pg_indexes
WHERE tablename = 'payment_webhook_inbox'
  AND indexdef ILIKE '%provider_event_id%';

-- F. Published academic tables untouched (row count snapshot before/after)
SELECT 'programme_versions' AS t, COUNT(*) FROM ricoz.programme_versions
UNION ALL SELECT 'abc_credit_ledger', COUNT(*) FROM ricoz.abc_credit_ledger;
```

**App validation:** as `ricoz_app` with `app.tenant_id = T_A`, `SELECT` on `payment_webhook_inbox` where `tenant_id IS NULL` returns **0**.

**Reconciliation (fees pilot):** daily job compares `sum(payment_transactions.capture)` vs `sum(allocations)+sum(credits)` per account; alert on drift ? 0.

---

## 6. Performance impact

| Operation | Impact |
|-----------|--------|
| `CREATE TABLE` (empty) | Brief catalog locks; low |
| RLS policy create | Low |
| Permission `INSERT` | Negligible |
| Indexes on new empty tables | Low; build before traffic |
| Hot-table rewrites | **None** in this package |

**Peak-hour rule:** Run Phase A in off-peak anyway. If a future change adds indexes on `student_memberships` / `audit_events`, use `CREATE INDEX CONCURRENTLY` and never inside a transaction block.

**Connection budget:** Migration uses migrator pool (small). App pools unchanged.

---

## 7. Rollback plan

### Preferred: forward-fix
- Bug in app feature flag ? turn flag **off** (no DDL rollback).
- Bad permission grant ? revoke `role_permissions` for tenant.

### DDL rollback (only if Phase A failed or zero tenant data)
```text
migrate down 008 ? 007 ? 006 ? 005
```
**Forbidden in prod** if any of:
- `payment_transactions` / `payment_receipts` / `published_course_results` / `device_push_tokens` have rows, or
- Any tenant flag was enabled.

### Partial failure during up
- Fix forward with `009_fix_*.sql` (e.g. missing grant).
- Restore from backup only if catalog corrupt or migration left objects half-applied **and** forward-fix impossible — requires incident commander.

### Academic / payment safety
- Rollback must **not** delete published results or payments to “undo” a feature flag.

---

## 8. Tenant-level rollout plan

1. **Pilot (1–2 tenants):** enable notifications *or* assessment draft-only; no payment webhooks.
2. **Fees pilot:** offline/`manual` capture only + reconciliation; then Razorpay webhook with DEFINER ingest.
3. **Video pilot:** YouTube URL + progress; hosted upload later.
4. **Broaden** by region/campus using same flags.
5. Holders: if error budget burn on `webhook_*` or `mark_*` ? disable module for that tenant only.

Schema is cluster-wide; **isolation of blast radius = flags + role grants**, not separate DDL per tenant.

---

## 9. Monitoring

| Signal | Alert |
|--------|-------|
| `migration_job_success{version}` | Fail page on false |
| Migration duration | &gt; 30m warn |
| Lock wait count during migrate | Spike page |
| Replica lag | &gt; 30s during/after |
| After enable: `payment_webhook_orphan_age` (NULL tenant) | &gt; 60s |
| `payment_allocation_drift` | ? 0 |
| `revaluation_student_mismatch` exception rate | &gt; 0 unexpected |
| RLS deny / permission.denied rate | Anomaly vs baseline |
| Error rate 5xx on new routes | Budget burn |

Log migration steps with **correlation id**; never log secrets, APAAR, or push token plaintext.

---

## 10. Post-migration cleanup

- [ ] Confirm migrate ledger lists 005–008.
- [ ] Drop any temporary staging tables from dry-runs.
- [ ] Remove emergency `LOCK_TIMEOUT` session overrides.
- [ ] Document enabled tenants in change ticket.
- [ ] Schedule contract-phase review (+1 release).
- [ ] Destroy or encrypt backup copies per retention policy; retain restore proof.
- [ ] Close compatibility window only after pilot SLOs met.

---

## Rollback steps (operator card)

1. Disable module flags for affected tenants.  
2. Stop webhook workers / scale to 0.  
3. Forward-fix with hotfix **or** restore DB snapshot **only if** expand phase corrupted catalog and no payment/result rows exist.  
4. Notify Registrar + Finance.  
5. Post-incident: add `009_*` fix migration; never silently rewrite ledgers.

---

## Approval owners

| Role | Approves |
|------|----------|
| Tech lead / staff eng | DDL plan, lock strategy |
| DBA | Backup, PITR, lag |
| Security | RLS/DEFINER webhook design |
| Registrar | Assessment tables go-live |
| Finance | Fees/webhook go-live |
| SRE | Monitoring + rollback drill |
