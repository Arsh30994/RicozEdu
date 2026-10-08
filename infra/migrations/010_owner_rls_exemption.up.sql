-- 010: Let the migrator (table owner) bypass RLS where it cannot hold BYPASSRLS.
-- The API's migrator pool (bootstrap, login audit, outbox relay) assumes it bypasses RLS.
-- Managed Postgres (e.g. Render) cannot grant BYPASSRLS without a superuser, and FORCE ROW
-- LEVEL SECURITY then blocks the owner too. ricoz_app is never the owner, so it stays fully
-- subject to RLS either way.
DO $$
DECLARE t text;
BEGIN
  IF NOT (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    FOR t IN
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'ricoz' AND c.relforcerowsecurity
    LOOP
      EXECUTE format('ALTER TABLE ricoz.%I NO FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;
