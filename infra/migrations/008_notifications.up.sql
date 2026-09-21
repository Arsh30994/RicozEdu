-- 008: Notification infrastructure (APNs, FCM, email, SMS, WhatsApp, in-app)
-- Tokens encrypted at rest; never log full tokens; APNs sandbox ? production.
SET search_path TO ricoz, public;

CREATE TABLE notification_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid REFERENCES institutions(id),
  code            text NOT NULL,
  channel         text NOT NULL CHECK (channel IN (
                    'apns','fcm','email','sms','whatsapp','in_app'
                  )),
  locale          text NOT NULL DEFAULT 'en',
  subject_template text,
  body_template   text NOT NULL,
  -- deep_link_template must only contain resource ids, never secrets/PII
  deep_link_template text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','retired')),
  version_label   text NOT NULL DEFAULT '1',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT notification_templates_uq UNIQUE (tenant_id, code, channel, locale, version_label)
);

-- Device push tokens: APNs and FCM stored in separate rows (never mixed)
CREATE TABLE device_push_tokens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_id             uuid NOT NULL REFERENCES users(id),
  membership_id       uuid REFERENCES memberships(id),
  provider            text NOT NULL CHECK (provider IN ('apns','fcm')),
  -- envelope ciphertext; plaintext never persisted
  token_ciphertext    bytea NOT NULL,
  token_dek_wrapped   bytea NOT NULL,
  token_hmac          bytea NOT NULL, -- lookup without plaintext
  token_last4         text NOT NULL CHECK (char_length(token_last4) = 4),
  apns_environment    text CHECK (
                        apns_environment IS NULL
                        OR apns_environment IN ('sandbox','production')
                      ),
  bundle_id           text NOT NULL,
  device_id           text NOT NULL, -- stable client id
  platform            text NOT NULL CHECK (platform IN ('ios','android','web','other')),
  app_version         text,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','invalidated','unregistered','replaced')),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  invalidated_at      timestamptz,
  invalidation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT device_push_tokens_provider_env_chk CHECK (
    (provider = 'apns' AND apns_environment IS NOT NULL)
    OR (provider = 'fcm' AND apns_environment IS NULL)
  ),
  CONSTRAINT device_push_tokens_hmac_uq UNIQUE (tenant_id, provider, token_hmac)
);

CREATE INDEX device_push_tokens_user_idx
  ON device_push_tokens (tenant_id, user_id, status)
  WHERE status = 'active';

CREATE INDEX device_push_tokens_device_idx
  ON device_push_tokens (tenant_id, device_id, provider);

CREATE TABLE notification_preferences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_id             uuid NOT NULL REFERENCES users(id),
  channel             text NOT NULL CHECK (channel IN (
                        'apns','fcm','email','sms','whatsapp','in_app'
                      )),
  category            text NOT NULL DEFAULT 'general',
  enabled             boolean NOT NULL DEFAULT true,
  quiet_hours_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_uq UNIQUE (tenant_id, user_id, channel, category)
);

CREATE TABLE notification_audiences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid REFERENCES institutions(id),
  code                text NOT NULL,
  name                text NOT NULL,
  -- { roles:[], programmeIds:[], sectionIds:[], membershipIds:[], tags:[] }
  segment_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','retired')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT notification_audiences_uq UNIQUE (tenant_id, code)
);

CREATE TABLE notification_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid REFERENCES institutions(id),
  template_id         uuid REFERENCES notification_templates(id),
  channel             text NOT NULL CHECK (channel IN (
                        'apns','fcm','email','sms','whatsapp','in_app'
                      )),
  category            text NOT NULL DEFAULT 'general',
  audience_id         uuid REFERENCES notification_audiences(id),
  -- Safe payload only: title, body, deepLink resource refs ù no secrets/grades/PII blobs
  payload_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  deep_link           text,
  deep_link_resource_type text,
  deep_link_resource_id   uuid,
  priority            text NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low','normal','high')),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','dispatching','partial','delivered','failed','cancelled'
                      )),
  scheduled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  idempotency_key     text,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT notification_messages_idem_uq UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE notification_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  message_id          uuid NOT NULL REFERENCES notification_messages(id),
  user_id             uuid NOT NULL REFERENCES users(id),
  channel             text NOT NULL CHECK (channel IN (
                        'apns','fcm','email','sms','whatsapp','in_app'
                      )),
  device_token_id     uuid REFERENCES device_push_tokens(id),
  provider            text NOT NULL CHECK (provider IN (
                        'apns','fcm','ses','smtp','twilio','whatsapp_cloud','in_app'
                      )),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','sending','sent','delivered','failed',
                        'bounced','suppressed','cancelled'
                      )),
  attempt_count       int NOT NULL DEFAULT 0,
  max_attempts        int NOT NULL DEFAULT 5,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error_code     text,
  last_error_class    text CHECK (last_error_class IS NULL OR last_error_class IN (
                        'transient','permanent','auth','unregistered','unknown'
                      )),
  -- Never store full provider tokens / auth material in error metadata
  last_error_message  text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  tapped_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 1
);

CREATE INDEX notification_deliveries_poll_idx
  ON notification_deliveries (status, next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE INDEX notification_deliveries_message_idx
  ON notification_deliveries (tenant_id, message_id, status);

CREATE TABLE in_app_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_id             uuid NOT NULL REFERENCES users(id),
  delivery_id         uuid REFERENCES notification_deliveries(id),
  title               text NOT NULL,
  body                text NOT NULL,
  deep_link           text,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX in_app_notifications_user_idx
  ON in_app_notifications (tenant_id, user_id, created_at DESC);

-- Provider auth key material refs (JWT/key ids) ù never plaintext in logs
CREATE TABLE notification_provider_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES tenants(id), -- null = platform default
  provider            text NOT NULL CHECK (provider IN (
                        'apns','fcm','ses','smtp','twilio','whatsapp_cloud'
                      )),
  apns_environment    text CHECK (
                        apns_environment IS NULL
                        OR apns_environment IN ('sandbox','production')
                      ),
  bundle_id           text,
  credential_ref      text NOT NULL, -- KMS/vault path
  key_id              text,
  team_id             text,
  project_id          text, -- FCM
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','disabled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX notification_provider_configs_apns_uq
  ON notification_provider_configs (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), provider, COALESCE(apns_environment, ''), COALESCE(bundle_id, ''))
  WHERE provider = 'apns';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notification_templates','device_push_tokens','notification_preferences',
    'notification_audiences','notification_messages','notification_deliveries',
    'in_app_notifications','notification_provider_configs'
  ]
  LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
      EXECUTE format('ALTER TABLE %I OWNER TO ricoz_migrator', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ricoz_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- Platform-wide provider configs (tenant_id NULL) are NOT visible to ricoz_app.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;

INSERT INTO permissions (code, description) VALUES
  ('notification.read', 'Read notification templates and delivery status'),
  ('notification.send', 'Send / schedule notifications'),
  ('notification.manage', 'Manage templates, audiences, provider config'),
  ('finance.read', 'Read student fee accounts and payment status'),
  ('finance.manage', 'Manage fee structures, charges, and payment intents'),
  ('finance.refund.approve', 'Approve student fee refunds (human only)'),
  ('finance.concession.approve', 'Approve scholarships/concessions (human only)'),
  ('media.read', 'Read video/media resources'),
  ('media.manage', 'Manage video resources and pipelines'),
  ('media.upload', 'Create signed upload sessions')
ON CONFLICT (code) DO NOTHING;
