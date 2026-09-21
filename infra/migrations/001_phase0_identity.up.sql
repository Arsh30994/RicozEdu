-- Phase 0 identity, tenancy, IAM, students, audit/outbox
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ricoz;
SET search_path TO ricoz, public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ricoz.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ricoz.tenant_id_from_setting()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION ricoz.user_id_from_setting()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- =============================================================================
-- PLATFORM / TENANCY
-- =============================================================================

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'provisioning'
              CHECK (status IN ('provisioning','active','suspended','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  version     int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  CONSTRAINT tenants_slug_uq UNIQUE (slug)
);

CREATE TABLE institutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  code        text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','inactive','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  version     int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  CONSTRAINT institutions_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE campuses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT campuses_tenant_inst_code_uq UNIQUE (tenant_id, institution_id, code)
);

-- =============================================================================
-- PEOPLE / IAM
-- =============================================================================

CREATE TABLE persons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  given_name      text NOT NULL,
  family_name     text NOT NULL,
  display_name    text NOT NULL,
  primary_email   text,
  date_of_birth   date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT persons_email_uq UNIQUE (primary_email)
);

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id              uuid NOT NULL REFERENCES persons(id),
  email                  text NOT NULL,
  password_hash          text NOT NULL,
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('invited','active','disabled')),
  authorization_version  int NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  archived_at            timestamptz,
  CONSTRAINT users_email_uq UNIQUE (email),
  CONSTRAINT users_person_uq UNIQUE (person_id)
);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  token_hash   bytea NOT NULL,
  family_id    uuid NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id),
  code        text NOT NULL,
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  version     int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  CONSTRAINT roles_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  institution_id  uuid REFERENCES institutions(id),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','revoked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT user_memberships_tenant_user_uq UNIQUE (tenant_id, user_id)
);

CREATE TABLE role_bindings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_membership_id  uuid NOT NULL REFERENCES user_memberships(id),
  role_id             uuid NOT NULL REFERENCES roles(id),
  institution_id      uuid REFERENCES institutions(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid
);

CREATE UNIQUE INDEX role_bindings_uq
  ON role_bindings (tenant_id, user_membership_id, role_id, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE student_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  campus_id       uuid REFERENCES campuses(id),
  person_id       uuid NOT NULL REFERENCES persons(id),
  student_number  text NOT NULL,
  status          text NOT NULL DEFAULT 'prospective'
                  CHECK (status IN ('prospective','active','inactive','graduated','withdrawn','suspended')),
  effective_from  date NOT NULL DEFAULT (CURRENT_DATE),
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT student_memberships_number_uq UNIQUE (tenant_id, student_number),
  CONSTRAINT student_memberships_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX student_memberships_one_open_person
  ON student_memberships (tenant_id, person_id)
  WHERE status IN ('prospective','active','inactive','suspended') AND archived_at IS NULL;

CREATE TABLE student_status_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  from_status            text,
  to_status              text NOT NULL,
  reason                 text,
  changed_by_user_id     uuid REFERENCES users(id),
  changed_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid REFERENCES tenants(id),
  actor_user_id        uuid REFERENCES users(id),
  actor_membership_id  uuid REFERENCES user_memberships(id),
  action               text NOT NULL,
  resource_type        text NOT NULL,
  resource_id          uuid,
  correlation_id       uuid NOT NULL,
  ip_hash              bytea,
  user_agent_hash      bytea,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid REFERENCES tenants(id),
  aggregate_type   text NOT NULL,
  aggregate_id     uuid NOT NULL,
  event_type       text NOT NULL,
  payload          jsonb NOT NULL,
  idempotency_key  text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','published','failed')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz,
  CONSTRAINT outbox_events_idem_uq UNIQUE (idempotency_key)
);

CREATE TABLE idempotency_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  user_id        uuid NOT NULL REFERENCES users(id),
  key            text NOT NULL,
  request_hash   bytea NOT NULL,
  response_code  int,
  response_body  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_uq UNIQUE (tenant_id, user_id, key)
);

-- Indexes
CREATE INDEX user_memberships_user_idx ON user_memberships (user_id);
CREATE INDEX role_bindings_membership_idx ON role_bindings (tenant_id, user_membership_id);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_hash_idx ON refresh_tokens (token_hash);
CREATE INDEX student_memberships_person_idx ON student_memberships (tenant_id, person_id);
CREATE INDEX student_memberships_institution_idx ON student_memberships (tenant_id, institution_id);
CREATE INDEX student_status_history_student_idx ON student_status_history (tenant_id, student_membership_id, changed_at DESC);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id, created_at DESC);
CREATE INDEX outbox_events_poll_idx ON outbox_events (status, next_attempt_at) WHERE status = 'pending';

-- Seed permissions
INSERT INTO permissions (code, description) VALUES
  ('tenant.read','Read tenant'),
  ('tenant.manage','Manage tenant'),
  ('institution.read','Read institutions'),
  ('institution.manage','Manage institutions'),
  ('membership.read','Read memberships'),
  ('membership.manage','Manage memberships'),
  ('role.read','Read roles'),
  ('role.manage','Manage role bindings'),
  ('person.read','Read persons in tenant context'),
  ('person.manage','Manage persons'),
  ('student.read','Read students'),
  ('student.manage','Manage students'),
  ('academic.read','Read catalogue/enrolments'),
  ('academic.manage','Manage catalogue'),
  ('grade.manage','Manage working grades'),
  ('result.publish','Publish official results'),
  ('result.correct','Create result corrections'),
  ('credential.manage','Issue credentials'),
  ('audit.read','Read audit events'),
  ('platform.bootstrap','Bootstrap tenants')
ON CONFLICT (code) DO NOTHING;

-- System role templates (tenant_id NULL)
INSERT INTO roles (tenant_id, code, name, is_system)
SELECT NULL, v.code, v.name, true
FROM (VALUES
  ('TenantAdmin', 'Tenant Administrator'),
  ('Registrar', 'Registrar'),
  ('Instructor', 'Instructor'),
  ('Student', 'Student'),
  ('Auditor', 'Auditor')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id IS NULL AND r.code = v.code);

-- TenantAdmin gets all permissions except platform.bootstrap
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'TenantAdmin'
  AND p.code <> 'platform.bootstrap'
ON CONFLICT DO NOTHING;

-- Registrar
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'Registrar'
  AND p.code IN (
    'institution.read','person.read','person.manage','student.read','student.manage',
    'membership.read','academic.read','academic.manage','audit.read'
  )
ON CONFLICT DO NOTHING;

-- Instructor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'Instructor'
  AND p.code IN ('student.read','academic.read','grade.manage')
ON CONFLICT DO NOTHING;

-- Student
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'Student'
  AND p.code IN ('student.read','academic.read')
ON CONFLICT DO NOTHING;

-- Auditor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'Auditor'
  AND p.code IN ('audit.read','tenant.read','institution.read','student.read','person.read','membership.read')
ON CONFLICT DO NOTHING;

-- Ownership / grants (migrator owns; app subject to RLS)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
    ALTER SCHEMA ricoz OWNER TO ricoz_migrator;
    ALTER TABLE tenants OWNER TO ricoz_migrator;
    ALTER TABLE institutions OWNER TO ricoz_migrator;
    ALTER TABLE campuses OWNER TO ricoz_migrator;
    ALTER TABLE persons OWNER TO ricoz_migrator;
    ALTER TABLE users OWNER TO ricoz_migrator;
    ALTER TABLE refresh_tokens OWNER TO ricoz_migrator;
    ALTER TABLE permissions OWNER TO ricoz_migrator;
    ALTER TABLE roles OWNER TO ricoz_migrator;
    ALTER TABLE role_permissions OWNER TO ricoz_migrator;
    ALTER TABLE user_memberships OWNER TO ricoz_migrator;
    ALTER TABLE role_bindings OWNER TO ricoz_migrator;
    ALTER TABLE student_memberships OWNER TO ricoz_migrator;
    ALTER TABLE student_status_history OWNER TO ricoz_migrator;
    ALTER TABLE audit_events OWNER TO ricoz_migrator;
    ALTER TABLE outbox_events OWNER TO ricoz_migrator;
    ALTER TABLE idempotency_keys OWNER TO ricoz_migrator;
    ALTER TABLE schema_migrations OWNER TO ricoz_migrator;
  END IF;
END $$;

GRANT USAGE ON SCHEMA ricoz TO ricoz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ricoz TO ricoz_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ricoz TO ricoz_app;
REVOKE UPDATE, DELETE ON student_status_history, audit_events FROM ricoz_app;
GRANT INSERT, SELECT ON student_status_history, audit_events TO ricoz_app;

-- RLS
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON institutions FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campuses FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_memberships FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_bindings FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_read_system ON roles FOR SELECT TO ricoz_app
  USING (tenant_id IS NULL OR tenant_id = ricoz.tenant_id_from_setting());
CREATE POLICY roles_write_tenant ON roles FOR INSERT TO ricoz_app
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());
CREATE POLICY roles_update_tenant ON roles FOR UPDATE TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE student_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student_memberships FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student_status_history FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events FOR ALL TO ricoz_app
  USING (tenant_id IS NULL OR tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id IS NULL OR tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_events FOR ALL TO ricoz_app
  USING (tenant_id IS NULL OR tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id IS NULL OR tenant_id = ricoz.tenant_id_from_setting());

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON idempotency_keys FOR ALL TO ricoz_app
  USING (tenant_id = ricoz.tenant_id_from_setting())
  WITH CHECK (tenant_id = ricoz.tenant_id_from_setting());

-- tenants: app can read current tenant when context set
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_read ON tenants FOR SELECT TO ricoz_app
  USING (id = ricoz.tenant_id_from_setting());
CREATE POLICY tenants_update ON tenants FOR UPDATE TO ricoz_app
  USING (id = ricoz.tenant_id_from_setting())
  WITH CHECK (id = ricoz.tenant_id_from_setting());

-- Global tables: no tenant RLS; grants only
REVOKE ALL ON persons FROM PUBLIC;
REVOKE ALL ON users FROM PUBLIC;
REVOKE ALL ON refresh_tokens FROM PUBLIC;
REVOKE ALL ON permissions FROM PUBLIC;
REVOKE ALL ON role_permissions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON persons TO ricoz_app;
GRANT SELECT, INSERT, UPDATE ON users TO ricoz_app;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO ricoz_app;
GRANT SELECT ON permissions TO ricoz_app;
GRANT SELECT ON role_permissions TO ricoz_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA ricoz GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ricoz_app;
