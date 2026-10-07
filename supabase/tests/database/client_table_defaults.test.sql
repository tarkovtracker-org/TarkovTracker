BEGIN;
SELECT plan(9);

-- Test creation as the actual hosted migration role, not the local superuser.
SET LOCAL ROLE postgres;
CREATE TABLE public.client_default_acl_fixture (id INTEGER PRIMARY KEY, value TEXT);
CREATE VIEW public.client_default_acl_view WITH (security_invoker = TRUE)
  AS SELECT id, value FROM public.client_default_acl_fixture;

SELECT table_privs_are('public', 'client_default_acl_fixture', 'anon', ARRAY[]::TEXT[],
  'new postgres table has no anonymous grants');
SELECT table_privs_are('public', 'client_default_acl_fixture', 'authenticated', ARRAY[]::TEXT[],
  'new postgres table has no authenticated grants');
SELECT table_privs_are('public', 'client_default_acl_view', 'anon', ARRAY[]::TEXT[],
  'new postgres view has no anonymous grants');
SELECT table_privs_are('public', 'client_default_acl_view', 'authenticated', ARRAY[]::TEXT[],
  'new postgres view has no authenticated grants');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
  WHERE NOT has_table_privilege('service_role', 'public.client_default_acl_fixture', privilege)
), 'new table preserves service-role defaults');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT id FROM public.client_default_acl_fixture$$,
  '42501', NULL, 'new table is closed before explicit opt-in');
SELECT throws_ok($$TRUNCATE public.client_default_acl_fixture$$,
  '42501', NULL, 'new table cannot regain client TRUNCATE through defaults');
RESET ROLE;
SET LOCAL ROLE postgres;

ALTER TABLE public.client_default_acl_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_default_acl_fixture_read ON public.client_default_acl_fixture
  FOR SELECT TO authenticated USING (value = 'visible');
GRANT SELECT ON public.client_default_acl_fixture TO authenticated;
INSERT INTO public.client_default_acl_fixture VALUES (1, 'visible'), (2, 'hidden');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::INTEGER FROM public.client_default_acl_fixture), 1,
  'explicit grant and RLS opt-in works after default hardening');
SELECT throws_ok($$INSERT INTO public.client_default_acl_fixture VALUES (3, 'visible')$$,
  '42501', NULL, 'explicit read opt-in does not restore writes');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
