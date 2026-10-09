BEGIN;
SELECT plan(80);

-- Effective privileges include PUBLIC, inherited roles and column-only grants.
CREATE TEMP TABLE client_access_contract (relation TEXT, privileges TEXT[]);
INSERT INTO client_access_contract VALUES
  ('user_progress', ARRAY['SELECT']),
  ('account_ip_audit', ARRAY[]::TEXT[]),
  ('user_preferences', ARRAY['INSERT', 'SELECT', 'UPDATE']),
  ('api_tokens', ARRAY['DELETE', 'SELECT']),
  ('user_prestige_runs', ARRAY['DELETE', 'SELECT']),
  ('user_system', ARRAY['SELECT']),
  ('team_events', ARRAY['SELECT']),
  ('discord_account_links', ARRAY['SELECT']),
  ('team_memberships', ARRAY['SELECT']),
  ('teams', ARRAY['SELECT']),
  ('account_deletion_jobs', ARRAY['SELECT']);

SELECT is(
  ARRAY(SELECT privilege FROM unnest(ARRAY[
    'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
  ]) AS privilege WHERE has_table_privilege(client_role, 'public.' || relation, privilege)),
  CASE WHEN client_role = 'authenticated' THEN privileges ELSE ARRAY[]::TEXT[] END,
  client_role || ' has exactly the intended table access to ' || relation
)
FROM client_access_contract
CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS client_role;

SELECT ok(NOT EXISTS (
  SELECT 1
  FROM pg_attribute a
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS privilege
  WHERE a.attrelid = ('public.' || contract.relation)::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege(client_role, a.attrelid, a.attnum, privilege) IS DISTINCT FROM (
      client_role = 'authenticated' AND (
        privilege = ANY(contract.privileges)
        OR (contract.relation = 'api_tokens' AND a.attname = 'note' AND privilege = 'UPDATE')
      )
    )
), client_role || ' has no unexpected column access to ' || contract.relation)
FROM client_access_contract contract
CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS client_role;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
  WHERE NOT has_table_privilege('service_role', 'public.' || relation, privilege)
), 'server DML remains available on ' || relation)
FROM client_access_contract;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM client_access_contract contract
  JOIN pg_class c ON c.oid = ('public.' || contract.relation)::regclass
  CROSS JOIN LATERAL aclexplode(c.relacl) acl
  WHERE acl.grantee = 0
), 'PUBLIC has no table grants on the reviewed tables');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM client_access_contract contract
  JOIN pg_class c ON c.oid = ('public.' || contract.relation)::regclass
  WHERE NOT c.relrowsecurity
), 'all reviewed tables retain RLS');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000663', 'access-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000664', 'access-outsider@example.invalid');
INSERT INTO public.api_tokens (token_id, user_id, token_hash, note, game_mode) VALUES
  ('00000000-0000-0000-0000-000000006631', '00000000-0000-0000-0000-000000000663', 'acl-owner', 'before', 'pvp'),
  ('00000000-0000-0000-0000-000000006641', '00000000-0000-0000-0000-000000000664', 'acl-outsider', 'untouched', 'pvp');
INSERT INTO public.user_prestige_runs (user_id, mode, prestige_from, prestige_to) VALUES
  ('00000000-0000-0000-0000-000000000663', 'pvp', 0, 1),
  ('00000000-0000-0000-0000-000000000664', 'pvp', 0, 1);
INSERT INTO public.user_preferences (user_id, streamer_mode) VALUES
  ('00000000-0000-0000-0000-000000000664', FALSE);
INSERT INTO public.discord_account_links (user_id, discord_user_id, discord_username) VALUES
  ('00000000-0000-0000-0000-000000000663', 'acl-owner', 'owner'),
  ('00000000-0000-0000-0000-000000000664', 'acl-outsider', 'outsider');
INSERT INTO public.account_deletion_jobs (user_id) VALUES
  ('00000000-0000-0000-0000-000000000664');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000663', TRUE);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.user_preferences (user_id, streamer_mode)
  VALUES ('00000000-0000-0000-0000-000000000663', FALSE)
  ON CONFLICT (user_id) DO UPDATE SET streamer_mode = EXCLUDED.streamer_mode$$,
  'preferences initial upsert works');
SELECT lives_ok($$INSERT INTO public.user_preferences (user_id, streamer_mode)
  VALUES ('00000000-0000-0000-0000-000000000663', TRUE)
  ON CONFLICT (user_id) DO UPDATE SET streamer_mode = EXCLUDED.streamer_mode$$,
  'preferences conflict update works');
SELECT is((SELECT streamer_mode FROM public.user_preferences WHERE
  user_id = '00000000-0000-0000-0000-000000000663'), TRUE, 'preferences update persists');
SELECT is((SELECT count(*)::INTEGER FROM public.user_preferences WHERE
  user_id = '00000000-0000-0000-0000-000000000664'), 0, 'other preferences stay hidden');
SELECT throws_ok($$INSERT INTO public.user_preferences (user_id)
  VALUES ('00000000-0000-0000-0000-000000000664') ON CONFLICT (user_id) DO UPDATE SET streamer_mode = TRUE$$,
  '42501', NULL, 'preferences upsert cannot overwrite another owner');
SELECT lives_ok($$UPDATE public.api_tokens SET note = 'renamed' WHERE
  token_id = '00000000-0000-0000-0000-000000006631'$$, 'owner can rename a token');
SELECT is((SELECT note FROM public.api_tokens WHERE
  token_id = '00000000-0000-0000-0000-000000006631'), 'renamed', 'token rename persists');
SELECT throws_ok($$UPDATE public.api_tokens SET permissions = ARRAY['write']$$,
  '42501', NULL, 'token permissions cannot be updated by a client');
WITH removed AS (DELETE FROM public.api_tokens RETURNING token_id)
SELECT is(count(*)::INTEGER, 1, 'owner can delete only own tokens') FROM removed;
WITH removed AS (DELETE FROM public.user_prestige_runs RETURNING id)
SELECT is(count(*)::INTEGER, 1, 'owner can delete only own prestige history') FROM removed;
SELECT throws_ok($$INSERT INTO public.user_prestige_runs (user_id, mode, prestige_from, prestige_to)
  VALUES ('00000000-0000-0000-0000-000000000663', 'pvp', 0, 1)$$,
  '42501', NULL, 'prestige history writes remain RPC-only');
SELECT is((SELECT count(*)::INTEGER FROM public.user_system), 1, 'system listener can read only own row');
SELECT throws_ok($$DELETE FROM public.user_system$$,
  '42501', NULL, 'clients cannot delete server-owned system rows');
SELECT is((SELECT count(*)::INTEGER FROM public.discord_account_links), 1, 'Discord link read remains owner-scoped');
SELECT throws_ok($$UPDATE public.discord_account_links SET discord_username = 'forged'$$,
  '42501', NULL, 'Discord writes remain server-only');
SELECT throws_ok($$SELECT user_id FROM public.account_ip_audit$$,
  '42501', NULL, 'IP audit is inaccessible to clients');
SELECT throws_ok($$DELETE FROM public.team_events$$,
  '42501', NULL, 'team event deletion is server-only');
SELECT is((SELECT count(*)::INTEGER FROM public.account_deletion_jobs), 0, 'ordinary user cannot read deletion jobs');
SELECT throws_ok($$DELETE FROM public.user_preferences$$,
  '42501', NULL, 'preferences deletion uses the server account-deletion workflow');
RESET ROLE;

UPDATE public.user_system SET is_admin = TRUE WHERE user_id = '00000000-0000-0000-0000-000000000663';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::INTEGER FROM public.account_deletion_jobs), 1, 'admin can still read deletion jobs');
RESET ROLE;
SELECT is((SELECT note FROM public.api_tokens WHERE user_id = '00000000-0000-0000-0000-000000000664'),
  'untouched', 'other token survives client mutations');
SELECT is((SELECT count(*)::INTEGER FROM public.user_prestige_runs WHERE
  user_id = '00000000-0000-0000-0000-000000000664'), 1, 'other prestige history survives deletion');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT user_id FROM public.user_progress$$, '42501', NULL, 'anonymous progress read lacks a grant');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
