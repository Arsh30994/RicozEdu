-- 002: Org hierarchy, resource scopes, delegation, sessions, devices, MFA
SET search_path TO ricoz, public;

-- Product "Organisation" === tenants (RLS boundary). Explicit alias view for clarity.
CREATE OR REPLACE VIEW organisations AS
  SELECT id, slug, name, status, created_at, updated_at, version, archived_at
  FROM tenants;

-- Allow multiple institution-scoped memberships per user within a tenant
ALTER TABLE user_memberships DROP CONSTRAINT IF EXISTS user_memberships_tenant_user_uq;
CREATE UNIQUE INDEX user_memberships_tenant_user_inst_uq
  ON user_memberships (
    tenant_id,
    user_id,
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Faculties
CREATE TABLE faculties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  campus_id       uuid REFERENCES campuses(id),
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
  CONSTRAINT faculties_tenant_inst_code_uq UNIQUE (tenant_id, institution_id, code)
);

-- Departments (under faculty)
CREATE TABLE departments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  faculty_id      uuid NOT NULL REFERENCES faculties(id),
  campus_id       uuid REFERENCES campuses(id),
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
  CONSTRAINT departments_tenant_faculty_code_uq UNIQUE (tenant_id, faculty_id, code)
);

-- Programme / Course / Section (scope hierarchy; catalog spine for authz)
CREATE TABLE programmes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  department_id   uuid REFERENCES departments(id),
  code            text NOT NULL,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('draft','active','retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT programmes_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  programme_id    uuid REFERENCES programmes(id),
  department_id   uuid REFERENCES departments(id),
  code            text NOT NULL,
  title           text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('draft','active','retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT courses_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  campus_id       uuid REFERENCES campuses(id),
  course_id       uuid NOT NULL REFERENCES courses(id),
  code            text NOT NULL,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','open','closed','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  archived_at     timestamptz,
  CONSTRAINT sections_tenant_course_code_uq UNIQUE (tenant_id, course_id, code)
);

-- Assigned student to section
CREATE TABLE section_student_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  section_id             uuid NOT NULL REFERENCES sections(id),
  student_membership_id  uuid NOT NULL REFERENCES student_memberships(id),
  status                 text NOT NULL DEFAULT 'assigned'
                         CHECK (status IN ('assigned','dropped','completed')),
  assigned_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  version                int NOT NULL DEFAULT 1,
  archived_at            timestamptz,
  CONSTRAINT section_student_assignments_uq UNIQUE (tenant_id, section_id, student_membership_id)
);

-- Resource scopes attached to role bindings (null = unrestricted at that level)
CREATE TABLE resource_scopes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  role_binding_id     uuid NOT NULL REFERENCES role_bindings(id) ON DELETE CASCADE,
  institution_id      uuid REFERENCES institutions(id),
  campus_id           uuid REFERENCES campuses(id),
  faculty_id          uuid REFERENCES faculties(id),
  department_id       uuid REFERENCES departments(id),
  programme_id        uuid REFERENCES programmes(id),
  course_id           uuid REFERENCES courses(id),
  section_id          uuid REFERENCES sections(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  CONSTRAINT resource_scopes_binding_uq UNIQUE (tenant_id, role_binding_id)
);

-- Delegations: temporary grant of a role binding scope from delegator to delegatee
CREATE TABLE delegations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  delegator_membership_id uuid NOT NULL REFERENCES user_memberships(id),
  delegatee_membership_id uuid NOT NULL REFERENCES user_memberships(id),
  role_id                 uuid NOT NULL REFERENCES roles(id),
  resource_scope_id       uuid REFERENCES resource_scopes(id),
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','expired','revoked','rejected')),
  effective_from          timestamptz NOT NULL DEFAULT now(),
  effective_to            timestamptz NOT NULL,
  revoked_at              timestamptz,
  revoked_by              uuid,
  revocation_reason       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_by              uuid,
  version                 int NOT NULL DEFAULT 1,
  CONSTRAINT delegations_dates_chk CHECK (effective_to > effective_from),
  CONSTRAINT delegations_not_self CHECK (delegator_membership_id <> delegatee_membership_id)
);

CREATE INDEX delegations_delegatee_idx ON delegations (tenant_id, delegatee_membership_id, status);
CREATE INDEX delegations_expiry_idx ON delegations (status, effective_to) WHERE status = 'active';

-- Devices
CREATE TABLE devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  device_key_hash bytea NOT NULL,
  display_name    text,
  platform        text CHECK (platform IS NULL OR platform IN ('ios','android','web','other')),
  last_seen_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_user_key_uq UNIQUE (user_id, device_key_hash)
);

-- Sessions (links access/refresh family to device)
CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  family_id          uuid NOT NULL,
  device_id          uuid REFERENCES devices(id),
  authorization_version_at_issue int NOT NULL,
  ip_hash            bytea,
  user_agent_hash    bytea,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoke_reason      text
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_family_idx ON sessions (family_id);

-- MFA methods (secrets stored as hashes / encrypted refs — never plaintext TOTP seed in logs)
CREATE TABLE mfa_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  method_type     text NOT NULL CHECK (method_type IN ('totp','webauthn','email_otp')),
  label           text,
  secret_ref      text NOT NULL, -- vault/KMS reference or encrypted blob pointer
  is_primary      boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  disabled_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1
);

CREATE INDEX mfa_methods_user_idx ON mfa_methods (user_id) WHERE disabled_at IS NULL;

-- Authorization version history (audit of bumps)
CREATE TABLE authorization_version_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  tenant_id   uuid REFERENCES tenants(id),
  from_version int NOT NULL,
  to_version   int NOT NULL,
  reason      text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for hierarchy
CREATE INDEX faculties_institution_idx ON faculties (tenant_id, institution_id);
CREATE INDEX departments_faculty_idx ON departments (tenant_id, faculty_id);
CREATE INDEX programmes_department_idx ON programmes (tenant_id, department_id);
CREATE INDEX courses_programme_idx ON courses (tenant_id, programme_id);
CREATE INDEX sections_course_idx ON sections (tenant_id, course_id);
CREATE INDEX section_assignments_student_idx ON section_student_assignments (tenant_id, student_membership_id);
CREATE INDEX resource_scopes_binding_idx ON resource_scopes (tenant_id, role_binding_id);

-- Extra permissions
INSERT INTO permissions (code, description) VALUES
  ('org.read','Read organisation'),
  ('org.manage','Manage organisation'),
  ('faculty.read','Read faculties'),
  ('faculty.manage','Manage faculties'),
  ('department.read','Read departments'),
  ('department.manage','Manage departments'),
  ('section.read','Read sections'),
  ('section.manage','Manage sections'),
  ('delegation.manage','Create and revoke delegations'),
  ('delegation.accept','Accept delegations'),
  ('session.manage','Manage own/other sessions'),
  ('mfa.manage','Manage MFA methods')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'TenantAdmin'
  AND p.code IN (
    'org.read','org.manage','faculty.read','faculty.manage',
    'department.read','department.manage','section.read','section.manage',
    'delegation.manage','session.manage','mfa.manage'
  )
ON CONFLICT DO NOTHING;

-- Ownership
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
    ALTER TABLE faculties OWNER TO ricoz_migrator;
    ALTER TABLE departments OWNER TO ricoz_migrator;
    ALTER TABLE programmes OWNER TO ricoz_migrator;
    ALTER TABLE courses OWNER TO ricoz_migrator;
    ALTER TABLE sections OWNER TO ricoz_migrator;
    ALTER TABLE section_student_assignments OWNER TO ricoz_migrator;
    ALTER TABLE resource_scopes OWNER TO ricoz_migrator;
    ALTER TABLE delegations OWNER TO ricoz_migrator;
    ALTER TABLE devices OWNER TO ricoz_migrator;
    ALTER TABLE sessions OWNER TO ricoz_migrator;
    ALTER TABLE mfa_methods OWNER TO ricoz_migrator;
    ALTER TABLE authorization_version_events OWNER TO ricoz_migrator;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON faculties, departments, programmes, courses, sections,
  section_student_assignments, resource_scopes, delegations TO ricoz_app;
GRANT SELECT, INSERT, UPDATE ON devices, sessions, mfa_methods, authorization_version_events TO ricoz_app;
REVOKE UPDATE, DELETE ON authorization_version_events FROM ricoz_app;
GRANT INSERT, SELECT ON authorization_version_events TO ricoz_app;

-- RLS helper for tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'faculties','departments','programmes','courses','sections',
    'section_student_assignments','resource_scopes','delegations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO ricoz_app
         USING (tenant_id = ricoz.tenant_id_from_setting())
         WITH CHECK (tenant_id = ricoz.tenant_id_from_setting())', t);
  END LOOP;
END $$;

-- sessions/devices/mfa are user-global (no tenant_id); access via app checks only
REVOKE ALL ON devices FROM PUBLIC;
REVOKE ALL ON sessions FROM PUBLIC;
REVOKE ALL ON mfa_methods FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON devices, sessions, mfa_methods TO ricoz_app;
