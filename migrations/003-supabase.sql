-- Run only in the NEW, dedicated Grecco Supabase project using db:migrate.
-- Private backend schema: do not add grecco to Supabase's exposed API schemas.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='grecco_backend') THEN
  CREATE ROLE grecco_backend LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $$;
REVOKE ALL ON SCHEMA grecco FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA grecco TO grecco_backend;
REVOKE ALL ON ALL TABLES IN SCHEMA grecco FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA grecco REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
DO $$ DECLARE item RECORD; BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='grecco' LOOP
  EXECUTE format('ALTER TABLE grecco.%I ENABLE ROW LEVEL SECURITY',item.tablename);
  EXECUTE format('ALTER TABLE grecco.%I FORCE ROW LEVEL SECURITY',item.tablename);
  EXECUTE format('CREATE POLICY grecco_server ON grecco.%I FOR ALL TO grecco_backend USING (true) WITH CHECK (true)',item.tablename);
 END LOOP;
END $$;
-- This database role is only usable by the server, never by Supabase Auth users.
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA grecco TO grecco_backend;
REVOKE ALL ON grecco.schema_migrations FROM grecco_backend;
GRANT SELECT ON grecco.schema_migrations TO grecco_backend;
ALTER TABLE grecco.users ADD CONSTRAINT users_supabase_identity FOREIGN KEY(auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sessions_user ON grecco.sessions(user_id);
