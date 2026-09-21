-- 006: Student fees & payment management (NOT RicozEdu SaaS billing)
-- Domain boundary: student_fee_* / payment_* only. SaaS invoices live elsewhere.
SET search_path TO ricoz, public;

-- Provider config: secrets stored as vault refs / ciphertext  never returned to clients
CREATE TABLE payment_provider_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  provider_code   text NOT NULL CHECK (provider_code IN (
                    'razorpay','payu','cashfree','stripe','manual','offline'
                  )),
  display_name    text NOT NULL,
  enabled_methods jsonb NOT NULL DEFAULT '["upi","card","netbanking"]'::jsonb,
  -- vault path or KMS ciphertext id  app never logs plaintext
  webhook_secret_ref text NOT NULL,
  api_key_ref     text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT payment_provider_configs_uq UNIQUE (tenant_id, institution_id, provider_code)
);

CREATE TABLE fee_structures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  name            text NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'INR',
  academic_year   text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','retired')),
  effective_from  date,
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT fee_structures_uq UNIQUE (tenant_id, code)
);

CREATE TABLE fee_structure_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  fee_structure_id  uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  component_code    text NOT NULL,
  component_type    text NOT NULL CHECK (component_type IN (
                      'programme','semester','hostel','transport',
                      'examination','miscellaneous','other'
                    )),
  name              text NOT NULL,
  amount_minor      bigint NOT NULL CHECK (amount_minor >= 0), -- minor units (paise)
  is_optional       boolean NOT NULL DEFAULT false,
  programme_id      uuid,
  semester_index    int,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT fee_structure_components_uq UNIQUE (tenant_id, fee_structure_id, component_code)
);

CREATE TABLE installment_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  fee_structure_id  uuid NOT NULL REFERENCES fee_structures(id),
  code              text NOT NULL,
  name              text NOT NULL,
  -- [{seq:1,dueDate:"2026-07-01",percent:40},{seq:2,...}] or amount_minor
  schedule_json     jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','retired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT installment_plans_uq UNIQUE (tenant_id, fee_structure_id, code)
);

CREATE TABLE late_fee_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  fee_structure_id  uuid REFERENCES fee_structures(id),
  code              text NOT NULL,
  -- {graceDays:7, type:"flat"|"percent_per_day", amountMinor:500, percent:0.1, maxMinor:5000}
  rule_json         jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','retired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT late_fee_rules_uq UNIQUE (tenant_id, code)
);

-- Student fee ledger (charges owed)
CREATE TABLE student_fee_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  fee_structure_id       uuid NOT NULL REFERENCES fee_structures(id),
  installment_plan_id    uuid REFERENCES installment_plans(id),
  currency               char(3) NOT NULL DEFAULT 'INR',
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','closed','on_hold','written_off')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT student_fee_accounts_uq UNIQUE (tenant_id, student_membership_id, fee_structure_id)
);

CREATE TABLE fee_charges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_fee_account_id uuid NOT NULL REFERENCES student_fee_accounts(id),
  component_type         text NOT NULL CHECK (component_type IN (
                           'programme','semester','hostel','transport',
                           'examination','miscellaneous','late_fee','other'
                         )),
  description            text NOT NULL,
  amount_minor           bigint NOT NULL CHECK (amount_minor >= 0),
  due_date               date,
  installment_seq        int,
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','partially_paid','paid','waived','cancelled')),
  allocated_minor        bigint NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  source_ref             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT fee_charges_alloc_chk CHECK (allocated_minor <= amount_minor)
);

CREATE INDEX fee_charges_account_idx ON fee_charges (tenant_id, student_fee_account_id, status);

-- Scholarships & concessions (human approval required  never auto by AI)
CREATE TABLE fee_adjustments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_fee_account_id uuid NOT NULL REFERENCES student_fee_accounts(id),
  adjustment_type        text NOT NULL CHECK (adjustment_type IN (
                           'scholarship','concession','waiver','write_off','other'
                         )),
  amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
  reason                 text NOT NULL,
  status                 text NOT NULL DEFAULT 'requested'
                         CHECK (status IN (
                           'requested','pending_approval','approved','rejected','applied','cancelled'
                         )),
  requested_by           uuid,
  approved_by            uuid,
  approved_at            timestamptz,
  applied_charge_id      uuid REFERENCES fee_charges(id),
  -- AI may draft suggestion_json; approval MUST be human (rule 14)
  suggestion_source      text CHECK (suggestion_source IS NULL OR suggestion_source IN (
                           'human','ai_draft','system'
                         )),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE payment_intents (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  student_fee_account_id uuid NOT NULL REFERENCES student_fee_accounts(id),
  provider_config_id     uuid NOT NULL REFERENCES payment_provider_configs(id),
  amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
  currency               char(3) NOT NULL DEFAULT 'INR',
  method                 text CHECK (method IS NULL OR method IN (
                           'upi','card','netbanking','wallet','offline','other'
                         )),
  status                 text NOT NULL DEFAULT 'created'
                         CHECK (status IN (
                           'created','pending_provider','requires_action',
                           'authorized','captured','failed','expired','cancelled'
                         )),
  client_idempotency_key text NOT NULL,
  provider_order_id      text,
  provider_payment_id    text,
  -- Never store PAN/CVV/UPI PIN; metadata is redacted provider refs only
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at             timestamptz,
  captured_at            timestamptz,
  failure_code           text,
  failure_message        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  CONSTRAINT payment_intents_idem_uq UNIQUE (tenant_id, client_idempotency_key)
);

CREATE UNIQUE INDEX payment_intents_provider_order_uq
  ON payment_intents (tenant_id, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE TABLE payment_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  payment_intent_id      uuid NOT NULL REFERENCES payment_intents(id),
  provider_code          text NOT NULL,
  provider_transaction_id text NOT NULL,
  provider_event_id      text,
  amount_minor           bigint NOT NULL,
  currency               char(3) NOT NULL DEFAULT 'INR',
  txn_type               text NOT NULL CHECK (txn_type IN (
                           'authorize','capture','fail','refund','reversal','adjustment'
                         )),
  status                 text NOT NULL CHECK (status IN (
                           'succeeded','failed','pending','unknown'
                         )),
  raw_payload_redacted   jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_provider_uq
    UNIQUE (tenant_id, provider_code, provider_transaction_id, txn_type)
);

-- Allocation of captured funds to charges (prevents duplicate allocation)
CREATE TABLE payment_allocations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  payment_intent_id      uuid NOT NULL REFERENCES payment_intents(id),
  fee_charge_id          uuid NOT NULL REFERENCES fee_charges(id),
  amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
  allocation_key         text NOT NULL, -- deterministic: intentId:chargeId
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  CONSTRAINT payment_allocations_uq UNIQUE (tenant_id, allocation_key),
  CONSTRAINT payment_allocations_once UNIQUE (tenant_id, payment_intent_id, fee_charge_id)
);

-- Overpayment credit balance on account
CREATE TABLE fee_credits (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_fee_account_id uuid NOT NULL REFERENCES student_fee_accounts(id),
  payment_intent_id      uuid REFERENCES payment_intents(id),
  amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
  remaining_minor        bigint NOT NULL CHECK (remaining_minor >= 0),
  status                 text NOT NULL DEFAULT 'available'
                         CHECK (status IN ('available','applied','refunded','voided')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_credits_remaining_chk CHECK (remaining_minor <= amount_minor)
);

CREATE TABLE payment_receipts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  payment_intent_id      uuid NOT NULL REFERENCES payment_intents(id),
  receipt_number         text NOT NULL,
  amount_minor           bigint NOT NULL,
  currency               char(3) NOT NULL DEFAULT 'INR',
  issued_at              timestamptz NOT NULL DEFAULT now(),
  document_object_id     uuid,
  content_hash           bytea NOT NULL,
  status                 text NOT NULL DEFAULT 'issued'
                         CHECK (status IN ('issued','voided','superseded')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  CONSTRAINT payment_receipts_uq UNIQUE (tenant_id, receipt_number),
  CONSTRAINT payment_receipts_intent_uq UNIQUE (tenant_id, payment_intent_id)
);

CREATE TABLE refund_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  payment_intent_id      uuid NOT NULL REFERENCES payment_intents(id),
  amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
  reason                 text NOT NULL,
  status                 text NOT NULL DEFAULT 'requested'
                         CHECK (status IN (
                           'requested','pending_approval','approved','rejected',
                           'processing','succeeded','failed','cancelled'
                         )),
  suggestion_source      text CHECK (suggestion_source IS NULL OR suggestion_source IN (
                           'human','ai_draft','system'
                         )),
  requested_by           uuid,
  approved_by            uuid,
  approved_at            timestamptz,
  provider_refund_id     text,
  failure_message        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1
);

-- Webhook inbox: handles delayed, duplicated, reordered, missing events
CREATE TABLE payment_webhook_inbox (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid REFERENCES tenants(id),
  provider_code          text NOT NULL,
  provider_event_id      text NOT NULL,
  signature_valid        boolean NOT NULL,
  processing_status      text NOT NULL DEFAULT 'received'
                         CHECK (processing_status IN (
                           'received','processing','processed','ignored','failed'
                         )),
  event_type             text,
  payload_redacted       jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at            timestamptz NOT NULL DEFAULT now(),
  processed_at           timestamptz,
  error_message          text,
  attempt_count          int NOT NULL DEFAULT 0,
  next_attempt_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_inbox_uq UNIQUE (provider_code, provider_event_id)
);

CREATE INDEX payment_webhook_inbox_poll_idx
  ON payment_webhook_inbox (processing_status, next_attempt_at)
  WHERE processing_status IN ('received','failed');

CREATE TABLE reconciliation_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  provider_config_id     uuid REFERENCES payment_provider_configs(id),
  status                 text NOT NULL DEFAULT 'queued'
                         CHECK (status IN (
                           'queued','running','completed','failed','cancelled'
                         )),
  window_start           timestamptz NOT NULL,
  window_end             timestamptz NOT NULL,
  matched_count          int NOT NULL DEFAULT 0,
  unmatched_provider     int NOT NULL DEFAULT 0,
  unmatched_local        int NOT NULL DEFAULT 0,
  cursor_token           text,
  last_error             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  started_at             timestamptz,
  completed_at           timestamptz,
  created_by             uuid,
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE reconciliation_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  run_id                 uuid NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  match_status           text NOT NULL CHECK (match_status IN (
                           'matched','provider_only','local_only','amount_mismatch','resolved'
                         )),
  provider_transaction_id text,
  payment_intent_id      uuid REFERENCES payment_intents(id),
  provider_amount_minor  bigint,
  local_amount_minor     bigint,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX reconciliation_items_uq
  ON reconciliation_items (
    tenant_id,
    run_id,
    COALESCE(provider_transaction_id, ''),
    COALESCE(payment_intent_id::text, '')
  );

CREATE TABLE financial_holds (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  reason                 text NOT NULL,
  hold_type              text NOT NULL DEFAULT 'fee_arrears'
                         CHECK (hold_type IN (
                           'fee_arrears','document','disciplinary','other'
                         )),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','released','expired')),
  blocks_registration    boolean NOT NULL DEFAULT true,
  blocks_exam            boolean NOT NULL DEFAULT true,
  blocks_result          boolean NOT NULL DEFAULT false,
  placed_at              timestamptz NOT NULL DEFAULT now(),
  released_at            timestamptz,
  placed_by              uuid,
  released_by            uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                int NOT NULL DEFAULT 1
);

CREATE TABLE accounting_export_batches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  institution_id         uuid NOT NULL REFERENCES institutions(id),
  export_format          text NOT NULL CHECK (export_format IN ('csv','json','tally','zoho')),
  status                 text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','running','completed','failed')),
  window_start           timestamptz NOT NULL,
  window_end             timestamptz NOT NULL,
  row_count              int NOT NULL DEFAULT 0,
  document_object_id     uuid,
  content_hash           bytea,
  created_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  created_by             uuid,
  last_error             text
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_provider_configs','fee_structures','fee_structure_components',
    'installment_plans','late_fee_rules','student_fee_accounts','fee_charges',
    'fee_adjustments','payment_intents','payment_transactions','payment_allocations',
    'fee_credits','payment_receipts','refund_requests','payment_webhook_inbox',
    'reconciliation_runs','reconciliation_items','financial_holds',
    'accounting_export_batches'
  ]
  LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
      EXECUTE format('ALTER TABLE %I OWNER TO ricoz_migrator', t);
    END IF;
    -- Webhook inbox: never expose tenant_id IS NULL to ricoz_app (cross-tenant leak).
    -- Ingress inserts NULL-tenant rows only via ricoz_migrator / SECURITY DEFINER, then
    -- assigns tenant_id atomically before any tenant-scoped processing.
    IF t = 'payment_webhook_inbox' THEN
      EXECUTE format('REVOKE ALL ON %I FROM ricoz_app', t);
      EXECUTE format('GRANT SELECT, UPDATE ON %I TO ricoz_app', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ricoz_app', t);
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;

-- Platform ingress: insert unsigned/unscoped webhook rows without tenant context
CREATE OR REPLACE FUNCTION ricoz.ingest_payment_webhook(
  p_provider_code text,
  p_provider_event_id text,
  p_signature_valid boolean,
  p_event_type text,
  p_payload_redacted jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ricoz, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO payment_webhook_inbox (
    tenant_id, provider_code, provider_event_id, signature_valid,
    event_type, payload_redacted, processing_status
  ) VALUES (
    NULL, p_provider_code, p_provider_event_id, p_signature_valid,
    p_event_type, COALESCE(p_payload_redacted, '{}'::jsonb), 'received'
  )
  ON CONFLICT (provider_code, provider_event_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM payment_webhook_inbox
     WHERE provider_code = p_provider_code AND provider_event_id = p_provider_event_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION ricoz.ingest_payment_webhook(text, text, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ricoz.ingest_payment_webhook(text, text, boolean, text, jsonb) TO ricoz_app;

-- Bind tenant from payment_intents.provider_order_id; fails closed if ambiguous
CREATE OR REPLACE FUNCTION ricoz.assign_payment_webhook_tenant(
  p_inbox_id uuid,
  p_provider_order_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ricoz, public
AS $$
DECLARE
  v_tenant uuid;
  v_count int;
BEGIN
  SELECT COUNT(DISTINCT tenant_id), MIN(tenant_id)
    INTO v_count, v_tenant
    FROM payment_intents
   WHERE provider_order_id = p_provider_order_id;
  IF v_count <> 1 OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'webhook_tenant_unresolved';
  END IF;
  UPDATE payment_webhook_inbox
     SET tenant_id = v_tenant
   WHERE id = p_inbox_id AND tenant_id IS NULL;
  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION ricoz.assign_payment_webhook_tenant(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ricoz.assign_payment_webhook_tenant(uuid, text) TO ricoz_app;

-- Append-only style: no update/delete on allocations, receipts, transactions for app role
REVOKE UPDATE, DELETE ON payment_allocations, payment_transactions, payment_receipts FROM ricoz_app;
GRANT INSERT, SELECT ON payment_allocations, payment_transactions, payment_receipts TO ricoz_app;
