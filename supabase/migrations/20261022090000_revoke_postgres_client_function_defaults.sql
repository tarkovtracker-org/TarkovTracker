-- New functions created by the application's migration role require explicit
-- client EXECUTE opt-in. PostgreSQL grants function EXECUTE to PUBLIC globally,
-- and schema revokes cannot cancel a global default, so PUBLIC is revoked
-- globally and the Supabase anon/authenticated grants are revoked in public.
-- Existing function grants and service-role public defaults stay.
-- supabase_admin defaults are platform-owned and cannot be changed by postgres.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
