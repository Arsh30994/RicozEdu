-- 011: Tenant-scoped AI knowledge, conversations, and study artifacts.
-- Original binary uploads are intentionally not stored here. The application
-- persists extracted, approved text only, keeping the retrieval surface small.
SET search_path TO ricoz, public;

CREATE TABLE ai_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid REFERENCES institutions(id),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  source_type     text NOT NULL CHECK (source_type IN ('text','markdown','pdf')),
  content_sha256  text NOT NULL,
  status          text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing','ready','failed','deleted')),
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT ai_documents_content_uq UNIQUE (tenant_id, content_sha256)
);

CREATE TABLE ai_document_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  document_id     uuid NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  ordinal         int NOT NULL CHECK (ordinal >= 0),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_document_chunks_uq UNIQUE (document_id, ordinal)
);

CREATE INDEX ai_documents_tenant_status_idx
  ON ai_documents (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX ai_document_chunks_document_idx
  ON ai_document_chunks (tenant_id, document_id, ordinal);
CREATE INDEX ai_document_chunks_search_idx
  ON ai_document_chunks USING gin (to_tsvector('simple', content));

CREATE TABLE ai_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),
  role            text NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 16000),
  sources_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_trace_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_owner_idx ON ai_conversations (tenant_id, user_id, updated_at DESC);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (tenant_id, conversation_id, created_at ASC);

CREATE TABLE ai_study_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  kind            text NOT NULL CHECK (kind IN ('flashcards','quiz','revision_plan','summary')),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  content_json    jsonb NOT NULL,
  source_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_study_artifacts_owner_idx
  ON ai_study_artifacts (tenant_id, user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_documents','ai_document_chunks','ai_conversations','ai_messages','ai_study_artifacts']
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

-- Conversations and study artifacts are personal data within a tenant. Their
-- service methods also filter by user, but RLS supplies a second boundary.
DROP POLICY tenant_isolation ON ai_conversations;
CREATE POLICY ai_conversations_owner ON ai_conversations FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting() AND user_id = ricoz.user_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting() AND user_id = ricoz.user_id_from_setting());

DROP POLICY tenant_isolation ON ai_messages;
CREATE POLICY ai_messages_owner ON ai_messages FOR ALL TO ricoz_app
  USING (
    tenant_id = ricoz.tenant_id_from_setting()
    AND EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND c.tenant_id = ricoz.tenant_id_from_setting()
        AND c.user_id = ricoz.user_id_from_setting()
    )
  )
  WITH CHECK (
    tenant_id = ricoz.tenant_id_from_setting()
    AND user_id = ricoz.user_id_from_setting()
    AND EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND c.tenant_id = ricoz.tenant_id_from_setting()
        AND c.user_id = ricoz.user_id_from_setting()
    )
  );

DROP POLICY tenant_isolation ON ai_study_artifacts;
CREATE POLICY ai_study_artifacts_owner ON ai_study_artifacts FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting() AND user_id = ricoz.user_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting() AND user_id = ricoz.user_id_from_setting());

INSERT INTO permissions (code, description) VALUES
  ('ai.use', 'Use the Ricoz AI assistant and own study workspace'),
  ('ai.document.manage', 'Upload and manage approved AI knowledge documents'),
  ('ai.study.use', 'Generate and manage personal AI study artifacts')
ON CONFLICT (code) DO NOTHING;

-- Existing system roles were seeded before this migration, so grant the new
-- permissions explicitly rather than relying on the original "all" query.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.code = 'TenantAdmin'
  AND p.code IN ('ai.use','ai.document.manage','ai.study.use')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.code IN ('Registrar','Instructor')
  AND p.code IN ('ai.use','ai.study.use')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.code = 'Student'
  AND p.code IN ('ai.use','ai.study.use')
ON CONFLICT DO NOTHING;
