-- New public tables and views created by the application's migration role
-- require explicit client opt-in. Existing object and service-role grants stay.
-- Production has no global client table defaults; audit global and public ACLs
-- before rollout. Schema revokes cannot override a global default grant.
-- supabase_admin defaults are platform-owned and cannot be changed by postgres.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

COMMIT;
