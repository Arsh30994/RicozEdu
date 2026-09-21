# Security review follow-ups

Source: [Security Review](810f3f03-cbfd-4937-b52d-0f81b29f82a9) — verdict was **DO NOT APPROVE**.

## Remediated in tree

| ID | Fix |
|----|-----|
| H-1 | `payment_webhook_inbox` no longer allows `tenant_id IS NULL` under `ricoz_app` RLS; ingress via `ricoz.ingest_payment_webhook` + `assign_payment_webhook_tenant` SECURITY DEFINER |
| H-2 | Trigger `enforce_revaluation_student_match` binds student to published result |
| M-1 | Stripe verifies `t.rawBody` HMAC; PayU/Cashfree fail-closed until dedicated modules |
| M-2 | `isCapturableEvent` allowlist; unknown stays non-capturable |
| M-3 | Approval helpers require permission flags + second human for AI drafts |
| M-4 | Redaction covers ciphertext / vault refs |
| M-5 | Pass/fail uses same `scaleValue` as letter grade |
| M-6 | Platform NULL `notification_provider_configs` hidden from tenants |
| M-7 | `planAllocation` requires `studentFeeAccountId` match |
| Perms | Seeded `finance.*` and `media.*` in migration 008 |

## Still open before payment/NAD production

- Wire webhook controller to DEFINER ingest + capturable checks + amount match.
- PayU/Cashfree signature modules.
- Institution-scoped RLS (tenant-only today).
- Mark `submitted?draft` audit/permission gate in API.
- Full API guards for assessment/fees/video (schemas only partially wired).

**Status:** High blockers addressed in schema/engines; re-review after webhook route lands before production payment ingress.
