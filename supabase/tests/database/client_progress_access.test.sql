BEGIN;

SELECT plan(27);

CREATE TEMP TABLE client_progress_fixture AS
SELECT
  '00000000-0000-0000-0000-000000000741'::UUID AS viewer_id,
  '00000000-0000-0000-0000-000000000742'::UUID AS teammate_id,
  '00000000-0000-0000-0000-000000000743'::UUID AS outsider_id,
  '00000000-0000-0000-0000-000000000744'::UUID AS team_id;

INSERT INTO auth.users (id, email)
VALUES
  ((SELECT viewer_id FROM client_progress_fixture), 'client-access-viewer@example.invalid'),
  ((SELECT teammate_id FROM client_progress_fixture), 'client-access-teammate@example.invalid'),
  ((SELECT outsider_id FROM client_progress_fixture), 'client-access-outsider@example.invalid');

INSERT INTO public.teams (id, name, join_code, max_members, owner_id, game_mode)
VALUES (
  (SELECT team_id FROM client_progress_fixture),
  'Client access test team',
  'client-access-test-code',
  5,
  (SELECT viewer_id FROM client_progress_fixture),
  'pvp'
);

INSERT INTO public.team_memberships (team_id, user_id, role, game_mode)
VALUES
  ((SELECT team_id FROM client_progress_fixture), (SELECT viewer_id FROM client_progress_fixture), 'owner', 'pvp'),
  ((SELECT team_id FROM client_progress_fixture), (SELECT teammate_id FROM client_progress_fixture), 'member', 'pvp');

CREATE TEMP TABLE client_progress_protected_tables (table_name TEXT PRIMARY KEY);
INSERT INTO client_progress_protected_tables (table_name)
VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress');

CREATE TEMP TABLE client_progress_privilege_fixture (
  authenticated_role TEXT NOT NULL,
  anon_role TEXT NOT NULL,
  role_name TEXT NOT NULL,
  table_prefix TEXT NOT NULL,
  execute_privilege TEXT NOT NULL,
  request_claim_name TEXT NOT NULL
);
INSERT INTO client_progress_privilege_fixture (
  authenticated_role,
  anon_role,
  role_name,
  table_prefix,
  execute_privilege,
  request_claim_name
)
VALUES ('authenticated', 'anon', 'service_role', 'public.', 'EXECUTE', 'request.jwt.claim.sub');

GRANT SELECT ON client_progress_fixture, client_progress_privilege_fixture TO authenticated;

UPDATE public.user_progress
SET
  pvp_data = '{"displayName":"PvP teammate","level":10}'::JSONB,
  pve_data = '{"displayName":"PvE teammate","level":20}'::JSONB
WHERE user_id = (SELECT teammate_id FROM client_progress_fixture);

SELECT ok(
  (SELECT bool_and(
    NOT has_table_privilege(
      (SELECT authenticated_role FROM client_progress_privilege_fixture),
      (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name,
      'INSERT'
    )
  )
   FROM client_progress_protected_tables),
  'authenticated clients cannot insert directly into protected tables'
);
SELECT ok(
  (SELECT bool_and(
    NOT has_table_privilege(
      (SELECT authenticated_role FROM client_progress_privilege_fixture),
      (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name,
      'UPDATE'
    )
  )
   FROM client_progress_protected_tables),
  'authenticated clients cannot update directly protected tables'
);
SELECT ok(
  (SELECT bool_and(
    NOT has_table_privilege(
      (SELECT authenticated_role FROM client_progress_privilege_fixture),
      (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name,
      'DELETE'
    )
  )
   FROM client_progress_protected_tables),
  'authenticated clients cannot delete directly from protected tables'
);
SELECT ok(
  (SELECT bool_and(
    has_table_privilege(
      (SELECT authenticated_role FROM client_progress_privilege_fixture),
      (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name,
      'SELECT'
    )
  )
   FROM client_progress_protected_tables),
  'authenticated clients retain required read access'
);
SELECT ok(
  (SELECT bool_and(
    has_table_privilege((SELECT role_name FROM client_progress_privilege_fixture), (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name, 'SELECT')
    AND has_table_privilege((SELECT role_name FROM client_progress_privilege_fixture), (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name, 'INSERT')
    AND has_table_privilege((SELECT role_name FROM client_progress_privilege_fixture), (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name, 'UPDATE')
    AND has_table_privilege((SELECT role_name FROM client_progress_privilege_fixture), (SELECT table_prefix FROM client_progress_privilege_fixture) || table_name, 'DELETE')
  ) FROM client_progress_protected_tables),
  'service-role workflows retain table access'
);
SELECT ok(
  has_function_privilege(
    (SELECT authenticated_role FROM client_progress_privilege_fixture),
    'public.get_teammate_legacy_progress(uuid,text)',
    (SELECT execute_privilege FROM client_progress_privilege_fixture)
  ),
  'authenticated clients can use the mode-scoped legacy progress RPC'
);
SELECT ok(
  NOT has_function_privilege(
    (SELECT anon_role FROM client_progress_privilege_fixture),
    'public.get_teammate_legacy_progress(uuid,text)',
    (SELECT execute_privilege FROM client_progress_privilege_fixture)
  ),
  'anonymous clients cannot use the legacy progress RPC'
);
SELECT ok(
  has_function_privilege(
    (SELECT authenticated_role FROM client_progress_privilege_fixture),
    'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)',
    (SELECT execute_privilege FROM client_progress_privilege_fixture)
  ),
  'authenticated clients can use the progress sync RPC'
);
SELECT ok(
  NOT has_function_privilege(
    (SELECT anon_role FROM client_progress_privilege_fixture),
    'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)',
    (SELECT execute_privilege FROM client_progress_privilege_fixture)
  ),
  'anonymous clients cannot use the progress sync RPC'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_progress'
      AND policyname = 'Users can view own and teammates progress'
  ),
  'the legacy teammate-wide progress policy is removed'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  (SELECT request_claim_name FROM client_progress_privilege_fixture),
  (SELECT viewer_id::TEXT FROM client_progress_fixture),
  TRUE
);
SELECT ok(
  public.get_teammate_legacy_progress(
    (SELECT teammate_id FROM client_progress_fixture),
    'pvp'
  )->>'displayName' = 'PvP teammate',
  'a same-mode teammate can read only the requested legacy mode'
);
SELECT ok(
  public.get_teammate_legacy_progress(
    (SELECT teammate_id FROM client_progress_fixture),
    'pve'
  ) IS NULL,
  'a teammate cannot read a legacy mode they do not share'
);
SELECT set_config(
  (SELECT request_claim_name FROM client_progress_privilege_fixture),
  (SELECT outsider_id::TEXT FROM client_progress_fixture),
  TRUE
);
SELECT is(
  public.get_teammate_legacy_progress(
    (SELECT teammate_id FROM client_progress_fixture),
    'pvp'
  ),
  NULL::JSONB,
  'users outside the team cannot read teammate progress'
);
SELECT set_config(
  (SELECT request_claim_name FROM client_progress_privilege_fixture),
  (SELECT viewer_id::TEXT FROM client_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pvp'::TEXT,
    1::INTEGER,
    NULL::BIGINT,
    '{"pvp":{"level":11}}'::JSONB,
    1::SMALLINT
  )$$,
  'authenticated clients can sync through the bounded RPC'
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pvp'::TEXT,
    1::INTEGER,
    NULL::BIGINT,
    '{"pvp":{"level":12},"seasonal":{"level":99}}'::JSONB,
    0::SMALLINT
  )$$,
  'a stale seasonal season number does not abort a multi-mode sync'
);
SELECT is(
  (
    SELECT pvp_data->>'level'
    FROM public.user_progress
    WHERE user_id = (SELECT viewer_id FROM client_progress_fixture)
  ),
  '12',
  'legacy PvP progress still commits when Seasonal state is stale'
);
SELECT is(
  (
    SELECT progress_data->>'level'
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT viewer_id FROM client_progress_fixture)
      AND game_mode = 'pvp'
      AND season_number = 0
  ),
  '12',
  'normalized PvP progress still commits when Seasonal state is stale'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT viewer_id FROM client_progress_fixture)
      AND game_mode = 'seasonal'
  ),
  0,
  'a stale seasonal season number never writes a seasonal row'
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'seasonal'::TEXT,
    1::INTEGER,
    NULL::BIGINT,
    '{"seasonal":{"level":11}}'::JSONB,
    NULL::SMALLINT
  )$$,
  'a missing seasonal season number is skipped instead of raising'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT viewer_id FROM client_progress_fixture)
      AND game_mode = 'seasonal'
  ),
  0,
  'a missing seasonal season number never writes a seasonal row'
);
SELECT throws_ok(
  format(
    $$SELECT public.sync_user_game_mode_progress(
      'pvp'::TEXT,
      1::INTEGER,
      NULL::BIGINT,
      %L::JSONB,
      0::SMALLINT
    )$$,
    jsonb_build_object('pvp', jsonb_build_object('displayName', repeat('x', 600000)))
  ),
  'p_modes exceeds the maximum payload size',
  'the sync RPC rejects payloads over the 512 KiB cap'
);
RESET ROLE;
-- Seed the bucket at the limit directly so this assertion does not depend on how
-- many syncs the preceding tests performed.
INSERT INTO public.mutation_rate_limits (scope, subject, count, reset_at)
VALUES (
  'progress-sync',
  (SELECT viewer_id::TEXT FROM client_progress_fixture),
  60,
  NOW() + INTERVAL '1 minute'
)
ON CONFLICT (scope, subject) DO UPDATE
SET count = 60,
    reset_at = NOW() + INTERVAL '1 minute';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pvp'::TEXT,
    1::INTEGER,
    NULL::BIGINT,
    '{"pvp":{"level":13}}'::JSONB,
    0::SMALLINT
  )$$,
  'Progress sync rate limit exceeded',
  'the sync RPC rejects a client that exhausted its per-minute budget'
);
RESET ROLE;
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.mutation_rate_limits
    WHERE scope = 'progress-sync'
      AND subject = (SELECT viewer_id::TEXT FROM client_progress_fixture)
  ),
  1,
  'the progress RPC records a per-user rate-limit bucket'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Team members can receive team broadcasts'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
  ),
  'a realtime read policy authorizes joining the private team topic'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Team members can send team broadcasts'
      AND cmd = 'INSERT'
      AND 'authenticated' = ANY (roles)
  ),
  'a realtime write policy exists for the private team topic'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  (SELECT request_claim_name FROM client_progress_privilege_fixture),
  (SELECT viewer_id::TEXT FROM client_progress_fixture),
  TRUE
);
SELECT set_config(
  'realtime.topic',
  (SELECT concat('team:', team_id::TEXT) FROM client_progress_fixture),
  TRUE
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.team_memberships membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND concat('team:', membership.team_id::text) = (SELECT realtime.topic())
  ),
  'a team member satisfies the realtime team topic predicate'
);
SELECT set_config(
  (SELECT request_claim_name FROM client_progress_privilege_fixture),
  (SELECT outsider_id::TEXT FROM client_progress_fixture),
  TRUE
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.team_memberships membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND concat('team:', membership.team_id::text) = (SELECT realtime.topic())
  ),
  'a user outside the team fails the realtime team topic predicate'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
