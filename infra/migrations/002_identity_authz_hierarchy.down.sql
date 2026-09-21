SET search_path TO ricoz, public;

DROP POLICY IF EXISTS tenant_isolation ON faculties;
DROP POLICY IF EXISTS tenant_isolation ON departments;
DROP POLICY IF EXISTS tenant_isolation ON programmes;
DROP POLICY IF EXISTS tenant_isolation ON courses;
DROP POLICY IF EXISTS tenant_isolation ON sections;
DROP POLICY IF EXISTS tenant_isolation ON section_student_assignments;
DROP POLICY IF EXISTS tenant_isolation ON resource_scopes;
DROP POLICY IF EXISTS tenant_isolation ON delegations;

DROP TABLE IF EXISTS authorization_version_events;
DROP TABLE IF EXISTS mfa_methods;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS delegations;
DROP TABLE IF EXISTS resource_scopes;
DROP TABLE IF EXISTS section_student_assignments;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS programmes;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS faculties;
DROP VIEW IF EXISTS organisations;

DROP INDEX IF EXISTS user_memberships_tenant_user_inst_uq;
ALTER TABLE user_memberships
  ADD CONSTRAINT user_memberships_tenant_user_uq UNIQUE (tenant_id, user_id);
