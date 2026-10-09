BEGIN;
SELECT plan(25);
-- Normalized writes remain usable after retiring the legacy columns and readers.
-- Keep the account clocks required by accepted normalized-reader clients.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000001028', 'legacy-writes-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000001029', 'legacy-writes-api@example.invalid'),
  ('00000000-0000-0000-0000-000000001030', 'legacy-writes-placeholder@example.invalid');
-- Signup creates account metadata without creating normalized placeholder rows.
CREATE TEMP TABLE frozen_accounts AS
SELECT user_id, ctid::text AS row_version, updated_at, metadata_write_id
FROM public.user_progress
WHERE user_id IN ('00000000-0000-0000-0000-000000001028', '00000000-0000-0000-0000-000000001029',
  '00000000-0000-0000-0000-000000001030');
CREATE FUNCTION pg_temp.account_unchanged(p_user_id uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT (current.ctid::text, current.updated_at, current.metadata_write_id)
      IS NOT DISTINCT FROM (frozen.row_version, frozen.updated_at, frozen.metadata_write_id)
  FROM public.user_progress current JOIN frozen_accounts frozen USING (user_id)
  WHERE current.user_id = p_user_id;
$$;
CREATE FUNCTION pg_temp.account_metadata_only(p_user_id uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT NOT (to_jsonb(current) ?| ARRAY['pvp_data', 'pve_data'])
  FROM public.user_progress current JOIN frozen_accounts frozen USING (user_id)
  WHERE current.user_id = p_user_id;
$$;

-- Catalog: the bridge and the legacy-only writer are gone, and no function writes the columns.
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.user_progress'::regclass AND tgname = 'sync_legacy_user_progress_modes'),
  'the legacy-to-normalized trigger is dropped');
SELECT is(to_regprocedure('public.sync_legacy_user_progress_modes()'), NULL,
  'the legacy-to-normalized trigger function is dropped');
SELECT is(to_regprocedure('public.update_task_completion(uuid,text,text,boolean,boolean,bigint)'),
  NULL, 'the legacy-only task writer is dropped');
SELECT is(
  (SELECT array_agg(n.nspname || '.' || p.proname ORDER BY 1)
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'private')
     AND (p.prosrc ~* '(insert\s+into|update)\s+(public\.)?user_progress\M[^;]*\m(pvp|pve)_data\M'
       OR (p.prosrc ~* 'execute\s+format\([^;]*user_progress' AND p.prosrc ~* '\m(pvp|pve)_data\M'))),
  NULL, 'no function writes user_progress.pvp_data or pve_data');
SELECT is(
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.user_progress'::regclass AND NOT t.tgisinternal
     AND p.prosrc ~* 'user_game_mode_progress'),
  0, 'no user_progress trigger writes normalized progress');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM public.user_game_mode_progress
    WHERE user_id IN ('00000000-0000-0000-0000-000000001028', '00000000-0000-0000-0000-000000001029',
      '00000000-0000-0000-0000-000000001030')),
  'signup leaves normalized progress unmaterialized');

-- Client sync: normalized progress only, with metadata and cached-client compatibility clocks.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001028', true);
CREATE TEMP TABLE sync_outcome AS
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":30,"progressEpoch":4},"pve":{"level":40,"progressEpoch":3},"seasonal":{"level":3}}',
  private.active_season_number()) AS data;
SELECT ok(pg_temp.account_metadata_only('00000000-0000-0000-0000-000000001028'),
  'a sync retains only account metadata');
SELECT ok(NOT pg_temp.account_unchanged('00000000-0000-0000-0000-000000001028'),
  'a persistent mode sync retains the cached-client account clock');
SELECT results_eq(
  $$SELECT game_mode, progress_data->>'level' FROM public.user_game_mode_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001028' ORDER BY game_mode$$,
  $$VALUES ('pve'::text, '40'::text), ('pvp', '30'), ('seasonal', '3')$$,
  'a sync writes every mode to normalized rows');
SELECT ok((SELECT data ?& ARRAY['tarkov_uid', 'tarkov_uid_conflict', 'metadata_write_id']
  FROM sync_outcome), 'the sync response contract is unchanged for rolling clients');
SELECT public.sync_user_game_mode_progress('pve', 2, NULL, '{"pvp":{"level":31,"progressEpoch":4}}', NULL);
SELECT results_eq(
  $$SELECT current_game_mode, game_edition FROM public.user_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001028'$$,
  $$VALUES ('pve'::text, 2)$$,
  'changed account metadata still commits');
SELECT ok(pg_temp.account_metadata_only('00000000-0000-0000-0000-000000001028'),
  'a metadata change retains only account metadata');

-- Prestige goes through the same normalized RPC.
SELECT public.archive_prestige_run_and_reset_progress('pvp', 0, 1, '{"level":31}', '{}',
  NULL, 'pve', 2, NULL, '{"level":1,"prestigeLevel":1,"progressEpoch":5}', NULL);
SELECT ok(pg_temp.account_metadata_only('00000000-0000-0000-0000-000000001028'),
  'a prestige reset retains only account metadata');
SELECT is((SELECT progress_data->>'prestigeLevel' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001028' AND game_mode = 'pvp'), '1',
  'a prestige reset writes normalized progress');

-- A placeholder or missing normalized row is the only merge base.
DELETE FROM public.user_game_mode_progress
WHERE user_id IN ('00000000-0000-0000-0000-000000001029', '00000000-0000-0000-0000-000000001030');
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
VALUES ('00000000-0000-0000-0000-000000001030', 'pvp', 0, '{}'::jsonb);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001030', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":1},"pve":{"level":2}}', NULL);
SELECT results_eq(
  $$SELECT game_mode, progress_data->>'level', progress_data->>'displayName'
    FROM public.user_game_mode_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001030' ORDER BY game_mode$$,
  $$VALUES ('pve'::text, '2'::text, NULL::text), ('pvp', '1', NULL)$$,
  'a sync merges only normalized state after legacy storage removal');
SELECT is((SELECT jsonb_array_length(progress_data->'manualActivityHistory')
  FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001030' AND game_mode = 'pvp'), 0,
  'an empty placeholder does not acquire unrelated manual history');
SELECT ok(NOT pg_temp.account_unchanged('00000000-0000-0000-0000-000000001030'),
  'first persistent sync of an existing account retains its compatibility clock');

-- Public API writes: normalized only, created empty when missing, retaining the account clock.
SELECT is(public.merge_progress_data('00000000-0000-0000-0000-000000001029', 'pvp_data',
  '{"task-a":{"complete":true,"timestamp":1}}', NULL, NULL), 1, 'an API write applies');
SELECT results_eq(
  $$SELECT progress_data->>'level', progress_data#>>'{taskCompletions,task-a,complete}'
    FROM public.user_game_mode_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001029' AND game_mode = 'pvp'$$,
  $$VALUES (NULL::text, 'true'::text)$$,
  'an API write creates a missing row empty after legacy storage removal');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001029', 'pve_data',
  NULL, NULL, '{"level":12}');
SELECT ok(pg_temp.account_metadata_only('00000000-0000-0000-0000-000000001029')
    AND NOT pg_temp.account_unchanged('00000000-0000-0000-0000-000000001029'),
  'PvP and PvE API writes retain account metadata and compatibility clocks');
-- Account activity comes from the normalized write.
DELETE FROM private.account_retention WHERE user_id = '00000000-0000-0000-0000-000000001029';
INSERT INTO private.account_retention (user_id, last_active_at, pending_since)
VALUES ('00000000-0000-0000-0000-000000001029', now() - interval '2 days', now() - interval '1 day');
CREATE TEMP TABLE seasonal_api_account_before AS
SELECT ctid::text AS row_version FROM public.user_progress
WHERE user_id = '00000000-0000-0000-0000-000000001029';
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001029', 'seasonal_data',
  NULL, NULL, '{"level":4}');
SELECT ok((SELECT pending_since IS NULL AND last_active_at > now() - interval '1 hour'
  FROM private.account_retention WHERE user_id = '00000000-0000-0000-0000-000000001029'),
  'a Seasonal API write still records account activity');
SELECT ok(pg_temp.account_metadata_only('00000000-0000-0000-0000-000000001029')
    AND (SELECT ctid::text IS DISTINCT FROM (SELECT row_version FROM seasonal_api_account_before)
         FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000001029')
    AND (SELECT (current_game_mode, game_edition, tarkov_uid) IS NOT DISTINCT FROM ('pvp', 1, NULL::bigint)
         FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000001029'),
  'a Seasonal API write advances only the account clock, as before');
SELECT results_eq(
  $$SELECT game_mode, season_number = CASE WHEN game_mode = 'seasonal'
      THEN private.active_season_number() ELSE 0 END, progress_data->>'level'
    FROM public.user_game_mode_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001029' AND game_mode <> 'pvp'
    ORDER BY game_mode$$,
  $$VALUES ('pve'::text, true, '12'::text), ('seasonal', true, '4')$$,
  'API writes reach the normalized row for their mode and season');
SELECT is(public.merge_progress_data('00000000-0000-0000-0000-00000000dead', 'pvp_data',
  NULL, NULL, '{"level":2}'), 0, 'an API write for an unknown account still reports no row');
SELECT ok(has_function_privilege('service_role',
    'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'the API merge keeps its service-role-only grant');
SELECT * FROM finish();
ROLLBACK;
