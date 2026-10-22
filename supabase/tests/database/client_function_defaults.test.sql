BEGIN;
SELECT plan(10);

-- Test creation as the actual hosted migration role, not the local superuser.
SET LOCAL ROLE postgres;
CREATE FUNCTION public.client_default_acl_definer()
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION public.client_default_acl_invoker()
RETURNS INTEGER LANGUAGE sql SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION private.client_default_acl_private()
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;

SELECT ok(NOT has_function_privilege('anon', 'public.client_default_acl_definer()', 'EXECUTE'),
  'new postgres public definer function has no anonymous EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'public.client_default_acl_definer()',
  'EXECUTE'), 'new postgres public definer function has no authenticated EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'public.client_default_acl_invoker()',
  'EXECUTE'), 'new postgres public invoker function has no authenticated EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'private.client_default_acl_private()',
  'EXECUTE'), 'new postgres private function has no PUBLIC-derived EXECUTE');
SELECT ok(has_function_privilege('service_role', 'public.client_default_acl_definer()', 'EXECUTE'),
  'new public function preserves service-role default');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.client_default_acl_definer()$$,
  '42501', NULL, 'new definer function is closed before explicit opt-in');
RESET ROLE;
SET LOCAL ROLE postgres;

GRANT EXECUTE ON FUNCTION public.client_default_acl_definer() TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is(public.client_default_acl_definer(), 1,
  'explicit EXECUTE opt-in works after default hardening');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.client_default_acl_definer()', 'EXECUTE'),
  'authenticated opt-in does not open the function to anon');

SELECT ok(has_function_privilege('authenticated', 'public.list_game_profiles()', 'EXECUTE'),
  'existing explicit client RPC grants stay');
SELECT ok(NOT has_function_privilege('authenticated', 'public.merge_progress_data(uuid, text, jsonb, jsonb, jsonb)',
  'EXECUTE'), 'existing revoked functions stay revoked');
SELECT * FROM finish();
ROLLBACK;
