DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_migrator') THEN
    CREATE ROLE ricoz_migrator LOGIN PASSWORD 'ricoz_migrator_dev' NOSUPERUSER CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ricoz_app') THEN
    CREATE ROLE ricoz_app LOGIN PASSWORD 'ricoz_app_dev' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE ricozedu TO ricoz_migrator;
GRANT CONNECT ON DATABASE ricozedu TO ricoz_app;
GRANT CREATE ON DATABASE ricozedu TO ricoz_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO ricoz_migrator;
GRANT USAGE ON SCHEMA public TO ricoz_app;
