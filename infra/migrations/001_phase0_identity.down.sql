SET search_path TO ricoz, public;

DROP POLICY IF EXISTS tenants_update ON tenants;
DROP POLICY IF EXISTS tenants_read ON tenants;
DROP POLICY IF EXISTS tenant_isolation ON idempotency_keys;
DROP POLICY IF EXISTS tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
DROP POLICY IF EXISTS tenant_isolation ON student_status_history;
DROP POLICY IF EXISTS tenant_isolation ON student_memberships;
DROP POLICY IF EXISTS roles_update_tenant ON roles;
DROP POLICY IF EXISTS roles_write_tenant ON roles;
DROP POLICY IF EXISTS roles_read_system ON roles;
DROP POLICY IF EXISTS tenant_isolation ON role_bindings;
DROP POLICY IF EXISTS tenant_isolation ON user_memberships;
DROP POLICY IF EXISTS tenant_isolation ON campuses;
DROP POLICY IF EXISTS tenant_isolation ON institutions;

DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS outbox_events CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS student_status_history CASCADE;
DROP TABLE IF EXISTS student_memberships CASCADE;
DROP TABLE IF EXISTS role_bindings CASCADE;
DROP TABLE IF EXISTS user_memberships CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS persons CASCADE;
DROP TABLE IF EXISTS campuses CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP FUNCTION IF EXISTS ricoz.user_id_from_setting();
DROP FUNCTION IF EXISTS ricoz.tenant_id_from_setting();
DROP FUNCTION IF EXISTS ricoz.set_updated_at();
