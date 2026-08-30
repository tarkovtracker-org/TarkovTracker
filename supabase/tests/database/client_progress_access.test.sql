BEGIN;

SELECT plan(14);

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

UPDATE public.user_progress
SET
  pvp_data = '{"displayName":"PvP teammate","level":10}'::JSONB,
  pve_data = '{"displayName":"PvE teammate","level":20}'::JSONB
WHERE user_id = (SELECT teammate_id FROM client_progress_fixture);

SELECT ok(
  (SELECT bool_and(NOT has_table_privilege('authenticated', 'public.' || table_name, 'INSERT'))
   FROM (VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress')) AS tables(table_name)),
  'authenticated clients cannot insert directly into protected tables'
);
SELECT ok(
  (SELECT bool_and(NOT has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE'))
   FROM (VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress')) AS tables(table_name)),
  'authenticated clients cannot update directly protected tables'
);
SELECT ok(
  (SELECT bool_and(NOT has_table_privilege('authenticated', 'public.' || table_name, 'DELETE'))
   FROM (VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress')) AS tables(table_name)),
  'authenticated clients cannot delete directly from protected tables'
);
SELECT ok(
  (SELECT bool_and(has_table_privilege('authenticated', 'public.' || table_name, 'SELECT'))
   FROM (VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress')) AS tables(table_name)),
  'authenticated clients retain required read access'
);
SELECT ok(
  (SELECT bool_and(
    has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
    AND has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
    AND has_table_privilege('service_role', 'public.' || table_name, 'UPDATE')
    AND has_table_privilege('service_role', 'public.' || table_name, 'DELETE')
  ) FROM (VALUES ('teams'), ('team_memberships'), ('user_progress'), ('user_game_mode_progress')) AS tables(table_name)),
  'service-role workflows retain table access'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_teammate_legacy_progress(uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients can use the mode-scoped legacy progress RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_teammate_legacy_progress(uuid,text)',
    'EXECUTE'
  ),
  'anonymous clients cannot use the legacy progress RPC'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)',
    'EXECUTE'
  ),
  'authenticated clients can use the progress sync RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.sync_user_game_mode_progress(text,integer,bigint,jsonb,smallint)',
    'EXECUTE'
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
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000741',
  TRUE
);
SELECT ok(
  public.get_teammate_legacy_progress(
    '00000000-0000-0000-0000-000000000742'::UUID,
    'pvp'
  )->>'displayName' = 'PvP teammate',
  'a same-mode teammate can read only the requested legacy mode'
);
SELECT ok(
  public.get_teammate_legacy_progress(
    '00000000-0000-0000-0000-000000000742'::UUID,
    'pve'
  ) IS NULL,
  'a teammate cannot read a legacy mode they do not share'
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
RESET ROLE;
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.mutation_rate_limits
    WHERE scope = 'progress-sync'
      AND subject = '00000000-0000-0000-0000-000000000741'
  ),
  1,
  'the progress RPC records a per-user rate-limit bucket'
);

SELECT * FROM finish();

ROLLBACK;
