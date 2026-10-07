BEGIN;
SELECT plan(33);

SELECT ok(
  NOT has_table_privilege(client_role, 'public.' || table_name,
    'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  client_role || ' cannot maintain ' || table_name
)
FROM unnest(ARRAY['anon', 'authenticated']) AS client_role
CROSS JOIN unnest(ARRAY[
  'user_progress', 'account_ip_audit', 'user_preferences', 'api_tokens',
  'user_prestige_runs', 'user_system', 'team_events', 'discord_account_links',
  'team_memberships', 'teams', 'account_deletion_jobs', 'supporters',
  'admin_audit_log', 'stripe_events'
]) AS table_name;

SELECT table_privs_are('public', 'user_preferences', 'authenticated',
  ARRAY['SELECT', 'INSERT', 'UPDATE'], 'client preferences sync access remains');
SELECT ok(has_table_privilege('authenticated', 'public.user_progress', 'SELECT'),
  'client progress reads remain');
SELECT ok(has_table_privilege('authenticated', 'public.team_memberships', 'SELECT'),
  'client team membership reads remain');
SELECT ok(has_column_privilege('authenticated', 'public.api_tokens', 'note', 'UPDATE'),
  'client token note updates remain');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$TRUNCATE public.user_progress$$,
  '42501', NULL, 'client cannot truncate progress despite RLS'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
