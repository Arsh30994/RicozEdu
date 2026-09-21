-- 007: Provider-neutral video resources (YouTube + institution-hosted)
SET search_path TO ricoz, public;

-- YouTube channel OAuth (tokens encrypted / vault refs — never returned raw)
CREATE TABLE youtube_channel_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  channel_id          text NOT NULL,
  channel_title       text,
  oauth_token_ref     text NOT NULL,
  refresh_token_ref   text,
  scopes              text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked','expired','error')),
  connected_by        uuid,
  connected_at        timestamptz NOT NULL DEFAULT now(),
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT youtube_channel_connections_uq UNIQUE (tenant_id, institution_id, channel_id)
);

-- Object storage assets (institution-hosted)
CREATE TABLE media_objects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  storage_provider    text NOT NULL DEFAULT 's3'
                      CHECK (storage_provider IN ('s3','gcs','azure','r2','other')),
  bucket              text NOT NULL,
  object_key          text NOT NULL,
  content_type        text,
  byte_size           bigint,
  etag                text,
  checksum_sha256     bytea,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','uploading','uploaded','scanning','scan_failed',
                        'ready','deleted','quarantined'
                      )),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT media_objects_uq UNIQUE (tenant_id, bucket, object_key)
);

-- Resumable uploads (web + iOS background)
CREATE TABLE media_upload_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  media_object_id     uuid NOT NULL REFERENCES media_objects(id),
  client_upload_id    text NOT NULL, -- client-generated for iOS BGURLSession
  status              text NOT NULL DEFAULT 'created'
                      CHECK (status IN (
                        'created','uploading','assembling','completed',
                        'aborted','expired','failed'
                      )),
  byte_size           bigint NOT NULL CHECK (byte_size > 0),
  chunk_size          int NOT NULL DEFAULT 5242880,
  bytes_received      bigint NOT NULL DEFAULT 0,
  parts_json          jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_url_expires_at timestamptz,
  -- signed URLs issued via API; never store long-lived secrets in row
  upload_strategy     text NOT NULL DEFAULT 'multipart'
                      CHECK (upload_strategy IN ('multipart','single','tus')),
  failure_code        text,
  failure_message     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT media_upload_sessions_client_uq UNIQUE (tenant_id, client_upload_id)
);

CREATE TABLE video_resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  institution_id      uuid NOT NULL REFERENCES institutions(id),
  code                text NOT NULL,
  title               text NOT NULL,
  description         text,
  provider            text NOT NULL CHECK (provider IN ('youtube','institution')),
  -- youtube
  youtube_video_id    text,
  youtube_channel_id  text,
  youtube_privacy     text CHECK (youtube_privacy IS NULL OR youtube_privacy IN (
                        'public','unlisted','private','unknown'
                      )),
  youtube_embeddable  boolean,
  youtube_live        boolean,
  youtube_age_restricted boolean,
  youtube_region_restricted boolean,
  youtube_removed     boolean NOT NULL DEFAULT false,
  youtube_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- institution hosted
  media_object_id     uuid REFERENCES media_objects(id),
  duration_seconds    numeric(12,3),
  thumbnail_object_id uuid REFERENCES media_objects(id),
  hls_manifest_object_id uuid REFERENCES media_objects(id),
  cdn_base_url        text,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN (
                        'draft','processing','ready','unavailable','archived','failed'
                      )),
  -- high-stakes completion must not rely on YouTube alone
  high_stakes         boolean NOT NULL DEFAULT false,
  completion_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT video_resources_uq UNIQUE (tenant_id, code),
  CONSTRAINT video_resources_provider_chk CHECK (
    (provider = 'youtube' AND youtube_video_id IS NOT NULL)
    OR (provider = 'institution' AND media_object_id IS NOT NULL)
  ),
  CONSTRAINT video_resources_high_stakes_chk CHECK (
    high_stakes = false OR provider = 'institution'
    OR (completion_policy_json ? 'requireQuiz' AND (completion_policy_json->>'requireQuiz')::boolean = true)
  )
);

CREATE TABLE video_pipeline_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  video_resource_id   uuid NOT NULL REFERENCES video_resources(id),
  media_object_id     uuid REFERENCES media_objects(id),
  job_type            text NOT NULL CHECK (job_type IN (
                        'virus_scan','transcode','hls_package','thumbnail',
                        'caption_extract','cdn_invalidate','youtube_refresh'
                      )),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','running','succeeded','failed','cancelled','deferred'
                      )),
  attempt_count       int NOT NULL DEFAULT 0,
  max_attempts        int NOT NULL DEFAULT 5,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  cursor_token        text,
  input_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  version             int NOT NULL DEFAULT 1
);

CREATE INDEX video_pipeline_jobs_poll_idx
  ON video_pipeline_jobs (status, next_attempt_at)
  WHERE status IN ('queued','deferred','failed');

CREATE TABLE video_captions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  video_resource_id   uuid NOT NULL REFERENCES video_resources(id),
  language_code       text NOT NULL,
  source              text NOT NULL CHECK (source IN (
                        'upload','auto','youtube','human','ai_draft'
                      )),
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','processing','ready','failed','retired')),
  media_object_id     uuid REFERENCES media_objects(id),
  format              text NOT NULL DEFAULT 'vtt' CHECK (format IN ('vtt','srt','ttml')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT video_captions_uq UNIQUE (tenant_id, video_resource_id, language_code, source)
);

CREATE TABLE video_transcripts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  video_resource_id   uuid NOT NULL REFERENCES video_resources(id),
  language_code       text NOT NULL,
  source              text NOT NULL CHECK (source IN (
                        'caption','asr','youtube','human','ai_draft'
                      )),
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','processing','ready','failed','retired')),
  media_object_id     uuid REFERENCES media_objects(id),
  text_preview        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT video_transcripts_uq UNIQUE (tenant_id, video_resource_id, language_code, source)
);

-- Progress: watched ranges + heartbeats (not position-only)
CREATE TABLE video_watch_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  video_resource_id      uuid NOT NULL REFERENCES video_resources(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  client_session_id      text NOT NULL,
  device_platform        text CHECK (device_platform IS NULL OR device_platform IN (
                           'web','ios','android','other'
                         )),
  started_at             timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at      timestamptz NOT NULL DEFAULT now(),
  last_position_seconds  numeric(12,3) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','ended','stale')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_watch_sessions_uq UNIQUE (tenant_id, client_session_id)
);

CREATE TABLE video_watched_ranges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  video_resource_id      uuid NOT NULL REFERENCES video_resources(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  start_seconds          numeric(12,3) NOT NULL CHECK (start_seconds >= 0),
  end_seconds            numeric(12,3) NOT NULL,
  source                 text NOT NULL DEFAULT 'online'
                         CHECK (source IN ('online','offline_sync','heartbeat')),
  client_event_id        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_watched_ranges_order_chk CHECK (end_seconds > start_seconds)
);

CREATE UNIQUE INDEX video_watched_ranges_client_event_uq
  ON video_watched_ranges (tenant_id, student_membership_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE TABLE video_progress_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  video_resource_id      uuid NOT NULL REFERENCES video_resources(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  merged_ranges_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  watched_seconds        numeric(12,3) NOT NULL DEFAULT 0,
  duration_seconds       numeric(12,3),
  percent_watched        numeric(6,3) NOT NULL DEFAULT 0,
  resume_position_seconds numeric(12,3) NOT NULL DEFAULT 0,
  completion_status      text NOT NULL DEFAULT 'in_progress'
                         CHECK (completion_status IN (
                           'in_progress','approximate_complete','complete','incomplete'
                         )),
  completion_confidence  text NOT NULL DEFAULT 'low'
                         CHECK (completion_confidence IN ('low','medium','high')),
  suspicious_flags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- suspicious flags NEVER auto-punish; review only
  quiz_passed            boolean,
  last_synced_at         timestamptz NOT NULL DEFAULT now(),
  version                int NOT NULL DEFAULT 1,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_progress_snapshots_uq
    UNIQUE (tenant_id, video_resource_id, student_membership_id)
);

CREATE TABLE video_completion_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  video_resource_id   uuid NOT NULL REFERENCES video_resources(id),
  min_percent         numeric(6,3) NOT NULL DEFAULT 90 CHECK (min_percent > 0 AND min_percent <= 100),
  require_quiz        boolean NOT NULL DEFAULT false,
  quiz_assessment_id  uuid, -- soft ref to assessment_instruments when present
  require_institution_host boolean NOT NULL DEFAULT false,
  allow_youtube_approximate boolean NOT NULL DEFAULT true,
  rule_version        text NOT NULL DEFAULT '1',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  version             int NOT NULL DEFAULT 1,
  CONSTRAINT video_completion_rules_uq UNIQUE (tenant_id, video_resource_id)
);

CREATE TABLE video_offline_sync_batches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  device_id              text NOT NULL,
  client_batch_id        text NOT NULL,
  status                 text NOT NULL DEFAULT 'received'
                         CHECK (status IN ('received','applied','partial','rejected')),
  payload_redacted       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at            timestamptz NOT NULL DEFAULT now(),
  applied_at             timestamptz,
  CONSTRAINT video_offline_sync_batches_uq UNIQUE (tenant_id, client_batch_id)
);

CREATE TABLE video_access_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  video_resource_id   uuid NOT NULL REFERENCES video_resources(id),
  grant_type          text NOT NULL CHECK (grant_type IN (
                        'section','programme','membership','role','public_institution'
                      )),
  section_id          uuid,
  programme_id        uuid,
  membership_id       uuid,
  role_code           text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'youtube_channel_connections','media_objects','media_upload_sessions',
    'video_resources','video_pipeline_jobs','video_captions','video_transcripts',
    'video_watch_sessions','video_watched_ranges','video_progress_snapshots',
    'video_completion_rules','video_offline_sync_batches','video_access_grants'
  ]
  LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
      EXECUTE format('ALTER TABLE %I OWNER TO ricoz_migrator', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ricoz_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON video_watched_ranges FROM ricoz_app;
GRANT INSERT, SELECT ON video_watched_ranges TO ricoz_app;
