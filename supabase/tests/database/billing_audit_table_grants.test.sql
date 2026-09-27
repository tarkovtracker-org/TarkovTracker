BEGIN;

SELECT plan(12);

-- Exact client-role privileges; any re-grant (including via default privileges) fails.
SELECT table_privs_are('public', 'stripe_events', 'anon', ARRAY[]::TEXT[],
  'anon has no privileges on stripe_events');
SELECT table_privs_are('public', 'stripe_events', 'authenticated', ARRAY[]::TEXT[],
  'authenticated has no privileges on stripe_events');
SELECT table_privs_are('public', 'supporters', 'anon', ARRAY[]::TEXT[],
  'anon has no privileges on supporters');
SELECT table_privs_are('public', 'supporters', 'authenticated', ARRAY['SELECT'],
  'authenticated can only SELECT supporters');
SELECT table_privs_are('public', 'admin_audit_log', 'anon', ARRAY[]::TEXT[],
  'anon has no privileges on admin_audit_log');
SELECT table_privs_are('public', 'admin_audit_log', 'authenticated', ARRAY['SELECT'],
  'authenticated can only SELECT admin_audit_log');

-- Server-side writers keep the access they need.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
    WHERE NOT has_table_privilege('service_role', 'public.stripe_events', privilege)
  ),
  'service_role keeps read/write on stripe_events'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
    WHERE NOT has_table_privilege('service_role', 'public.supporters', privilege)
  ),
  'service_role keeps read/write on supporters'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
    WHERE NOT has_table_privilege('service_role', 'public.admin_audit_log', privilege)
  ),
  'service_role keeps read/write on admin_audit_log'
);

-- Grants, not RLS, now reject client writes; TRUNCATE bypasses RLS entirely.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$TRUNCATE public.supporters$$,
  '42501',
  NULL,
  'authenticated cannot TRUNCATE supporters'
);
SELECT throws_ok(
  $$DELETE FROM public.admin_audit_log$$,
  '42501',
  NULL,
  'authenticated cannot DELETE from admin_audit_log'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.stripe_events (event_id, event_type) VALUES ('evt_grant_test', 'test')$$,
  '42501',
  NULL,
  'anon cannot INSERT into stripe_events'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
