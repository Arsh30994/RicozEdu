-- 010 down: re-FORCE RLS on every ricoz table that has RLS enabled.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ricoz' AND c.relrowsecurity AND NOT c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE ricoz.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
