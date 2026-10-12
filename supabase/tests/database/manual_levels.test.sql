BEGIN;
SELECT plan(28);
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_preferences'
    AND column_name = 'use_automatic_level_calculation'), 'automatic level preference column is absent');
SELECT ok(NOT public.sanitize_user_progress_mode_data('{"level":42,"xpOffset":12000}') ? 'xpOffset',
  'sanitizer drops numeric legacy offset');
SELECT ok(NOT public.sanitize_user_progress_mode_data('{"level":42,"xpOffset":"12000"}') ? 'xpOffset',
  'sanitizer drops string legacy offset');
SELECT is(public.sanitize_user_progress_mode_data('{"level":42,"xpOffset":12000}')->'level',
  '42'::jsonb, 'sanitizer preserves saved level');

SELECT is(public.merge_manual_activity_progress(
  '{"level":37,"progressEpoch":2}', '{"level":1,"progressEpoch":3,"xpOffset":0}')->'level',
  '1'::jsonb, 'legacy explicit reset epoch can still reset level');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000007020', 'manual-level-rpc@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007020', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":42,"xpOffset":9000},"pve":{"level":21,"xpOffset":"1000"},"seasonal":{"level":17,"xpOffset":2000}}',
  private.active_season_number());
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020' AND NOT progress_data ? 'xpOffset'),
  3::bigint, 'stale client sync discards offsets in every mode');
SELECT is((SELECT jsonb_object_agg(game_mode, progress_data->'level') FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020'),
  '{"pvp":42,"pve":21,"seasonal":17}'::jsonb, 'stale client sync preserves all saved levels');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000007020', 'pvp_data',
  NULL, NULL, '{"level":43,"xpOffset":20000}');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000007020', 'pve_data',
  NULL, NULL, '{"level":22,"xpOffset":"20000"}');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000007020', 'seasonal_data',
  NULL, NULL, '{"level":18,"xpOffset":20000}');
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020' AND NOT progress_data ? 'xpOffset'),
  3::bigint, 'stale API merges discard offsets in every mode');
SELECT is((SELECT jsonb_object_agg(game_mode, progress_data->'level') FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020'),
  '{"pvp":43,"pve":22,"seasonal":18}'::jsonb, 'API merges preserve explicitly supplied levels');

SELECT is(public.merge_manual_activity_progress('{"level":37}',
  '{"level":1,"xpOffset":0,"taskCompletions":{"legacy-task":true}}')->'level',
  '37'::jsonb, 'stale offset-bearing client retains the saved level');
SELECT is(public.merge_manual_activity_progress('{"level":37}', '{"level":40}')->'level',
  '40'::jsonb, 'refreshed client may update its manual level');
SELECT is(public.merge_manual_activity_progress('{"level":37}',
  '{"level":1,"xpOffset":0,"taskCompletions":{"legacy-task":true}}')->'taskCompletions',
  '{"legacy-task":true}'::jsonb, 'stale client can still sync task progress');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":1,"xpOffset":0},"pve":{"level":1,"xpOffset":"0"},"seasonal":{"level":1,"xpOffset":0}}',
  private.active_season_number());
SELECT is((SELECT jsonb_object_agg(game_mode, progress_data->'level') FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020'),
  '{"pvp":43,"pve":22,"seasonal":18}'::jsonb, 'stale RPC preserves saved manual levels across every mode');
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020' AND NOT progress_data ? 'xpOffset'),
  3::bigint, 'stale RPC cannot restore offsets while retaining manual levels');

-- Simulate a stored legacy field without sending one in the current API request.
CREATE FUNCTION pg_temp.inject_stored_api_offset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.progress_data := NEW.progress_data || '{"xpOffset":9000}'::jsonb;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_manual_level_api_fixture BEFORE UPDATE ON public.user_game_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_stored_api_offset();
UPDATE public.user_game_mode_progress SET progress_data = progress_data
WHERE user_id = '00000000-0000-0000-0000-000000007020' AND game_mode = 'pvp';
DROP TRIGGER zz_manual_level_api_fixture ON public.user_game_mode_progress;
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000007020', 'pvp_data',
  NULL, NULL, '{"level":44}');
SELECT is((SELECT progress_data->'level' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020' AND game_mode = 'pvp'),
  '44'::jsonb, 'current API level update is accepted when only stored data has a legacy offset');
SELECT ok((SELECT NOT progress_data ? 'xpOffset' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007020' AND game_mode = 'pvp'),
  'current API update removes the stored legacy offset');

-- The local catalog starts at Season 1. Advance only this rolled-back transaction
-- so the persisted Season 1 fixtures exercise historical Seasonal rows.
CREATE OR REPLACE FUNCTION private.active_season_number() RETURNS smallint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 2::smallint; $$;
CREATE TEMP TABLE manual_level_users (user_id uuid PRIMARY KEY);
INSERT INTO manual_level_users VALUES
  ('00000000-0000-0000-0000-000000007009'),
  ('00000000-0000-0000-0000-000000007010'),
  ('00000000-0000-0000-0000-000000007011');
-- Run after the current sanitizer to reproduce rows persisted by older clients.
-- The unknown nested field proves maintenance does not silently re-sanitize data.
CREATE FUNCTION pg_temp.inject_legacy_level_offset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IN (SELECT user_id FROM manual_level_users) THEN
    NEW.updated_at := '2024-01-02T03:04:05Z';
    IF TG_TABLE_NAME = 'user_progress' THEN
      -- A prior write must differ from the current transaction's marker.
      NEW.metadata_write_id := '0';
      NEW.pvp_data := '{"level":42,"xpOffset":9000,"legacy":{"keep":[null,1,"x"]}}';
      NEW.pve_data := '{"level":21,"xpOffset":"12000","legacy":{"keep":false}}';
    ELSE
      NEW.progress_data := '{"level":33,"xpOffset":9000,"legacy":{"keep":[null,1,"x"]}}';
      IF TG_TABLE_NAME = 'user_game_mode_progress' THEN
        NEW.progress_updated_at := '2023-06-07T08:09:10Z';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_manual_level_fixture BEFORE INSERT ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_legacy_level_offset();
CREATE TRIGGER zz_manual_level_fixture BEFORE INSERT ON public.user_game_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_legacy_level_offset();
CREATE TRIGGER zz_manual_level_fixture BEFORE INSERT ON public.user_profile_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_legacy_level_offset();
INSERT INTO auth.users (id, email)
SELECT user_id, user_id || '@manual-level.invalid' FROM manual_level_users;
DELETE FROM public.user_game_mode_progress WHERE user_id IN (SELECT user_id FROM manual_level_users);
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data, profile_public)
SELECT user_id, mode, season, '{"level":33}', true FROM manual_level_users
CROSS JOIN (VALUES ('pvp',0), ('pve',0), ('seasonal',1)) modes(mode,season);
INSERT INTO public.user_game_profiles (id, user_id, label)
SELECT user_id, user_id, 'Cleanup fixture' FROM manual_level_users;
INSERT INTO public.user_profile_mode_progress (profile_id, user_id, game_mode, season_number, progress_data, profile_public)
SELECT user_id, user_id, mode, season, '{"level":33}', true FROM manual_level_users
CROSS JOIN (VALUES ('pvp',0), ('pve',0), ('seasonal',1)) modes(mode,season);
INSERT INTO public.user_prestige_runs (user_id, mode, prestige_from, prestige_to, archived_progress, summary, created_at)
SELECT user_id, mode, 0, 1, '{"level":51,"xpOffset":"12345","legacy":{"keep":true}}',
  '{"tasksCompleted":7}', '2024-02-03T04:05:06Z' FROM manual_level_users
CROSS JOIN (VALUES ('pvp'), ('pve')) modes(mode);
DROP TRIGGER zz_manual_level_fixture ON public.user_progress;
DROP TRIGGER zz_manual_level_fixture ON public.user_game_mode_progress;
DROP TRIGGER zz_manual_level_fixture ON public.user_profile_mode_progress;
DELETE FROM private.account_retention WHERE user_id IN (SELECT user_id FROM manual_level_users);
INSERT INTO private.account_retention (user_id, last_active_at, pending_since)
SELECT user_id, '2024-01-02T03:04:05Z', '2024-06-07T08:09:10Z' FROM manual_level_users;

CREATE TEMP VIEW manual_level_rows AS
SELECT 'legacy' AS kind, user_id, to_jsonb(row) AS value FROM public.user_progress row
WHERE user_id IN (SELECT user_id FROM manual_level_users)
UNION ALL SELECT 'normalized', user_id, to_jsonb(row) FROM public.user_game_mode_progress row
WHERE user_id IN (SELECT user_id FROM manual_level_users)
UNION ALL SELECT 'profile', user_id, to_jsonb(row) FROM public.user_profile_mode_progress row
WHERE user_id IN (SELECT user_id FROM manual_level_users)
UNION ALL SELECT 'archive', user_id, to_jsonb(row) FROM public.user_prestige_runs row
WHERE user_id IN (SELECT user_id FROM manual_level_users)
UNION ALL SELECT 'retention', user_id, to_jsonb(row) FROM private.account_retention row
WHERE user_id IN (SELECT user_id FROM manual_level_users);
CREATE TEMP TABLE manual_level_expected AS
SELECT kind, user_id,
  CASE WHEN user_id <> '00000000-0000-0000-0000-000000007010' THEN value
    WHEN kind = 'legacy' THEN jsonb_set(jsonb_set(value, '{pvp_data}', (value->'pvp_data') - 'xpOffset'),
      '{pve_data}', (value->'pve_data') - 'xpOffset')
    WHEN kind IN ('normalized','profile') THEN jsonb_set(value, '{progress_data}', (value->'progress_data') - 'xpOffset')
    WHEN kind = 'archive' THEN jsonb_set(value, '{archived_progress}', (value->'archived_progress') - 'xpOffset')
    ELSE value END AS value
FROM manual_level_rows;
SELECT ok((SELECT bool_and(season_number < private.active_season_number())
  FROM public.user_game_mode_progress WHERE game_mode = 'seasonal'
    AND user_id IN (SELECT user_id FROM manual_level_users)),
  'cleanup fixtures include historical Seasonal progress');
SELECT is((SELECT count(*) FROM manual_level_rows WHERE user_id = '00000000-0000-0000-0000-000000007010'),
  10::bigint, 'cleanup fixtures include legacy, all modes, all profile modes, archives and retention');
SELECT ok((SELECT bool_and(value->'progress_data' ? 'xpOffset') FROM manual_level_rows
  WHERE kind IN ('normalized','profile')), 'fixture injection preserves legacy offsets after current sanitizer');

SELECT ok((SELECT bool_and(metadata_write_id IS DISTINCT FROM pg_catalog.pg_current_xact_id()::text)
  FROM public.user_progress WHERE user_id IN (SELECT user_id FROM manual_level_users)),
  'cleanup fixtures retain metadata markers from an earlier transaction');

\set from_user_id '00000000-0000-0000-0000-000000007010'
\set to_user_id '00000000-0000-0000-0000-000000007011'
\ir fixtures/remove-level-calculation-offsets.sql.inc
SELECT results_eq('SELECT value FROM manual_level_rows WHERE kind = ''legacy'' ORDER BY user_id',
  'SELECT value FROM manual_level_expected WHERE kind = ''legacy'' ORDER BY user_id',
  'legacy cleanup removes only xpOffset and preserves levels, timestamps and metadata markers');
SELECT results_eq('SELECT value FROM manual_level_rows WHERE kind = ''normalized'' ORDER BY user_id, value::text',
  'SELECT value FROM manual_level_expected WHERE kind = ''normalized'' ORDER BY user_id, value::text',
  'normalized cleanup preserves historical Seasonal, clocks, visibility and exact remaining JSON');
SELECT results_eq('SELECT value FROM manual_level_rows WHERE kind = ''profile'' ORDER BY user_id, value::text',
  'SELECT value FROM manual_level_expected WHERE kind = ''profile'' ORDER BY user_id, value::text',
  'profile cleanup preserves clocks, visibility and exact remaining JSON');
SELECT results_eq('SELECT value FROM manual_level_rows WHERE kind = ''archive'' ORDER BY user_id, value::text',
  'SELECT value FROM manual_level_expected WHERE kind = ''archive'' ORDER BY user_id, value::text',
  'prestige cleanup preserves archive levels, summaries, timestamps and exact remaining JSON');
SELECT results_eq('SELECT value FROM manual_level_rows WHERE kind = ''retention'' ORDER BY user_id',
  'SELECT value FROM manual_level_expected WHERE kind = ''retention'' ORDER BY user_id',
  'cleanup does not touch account retention');
SELECT results_eq('SELECT kind, user_id, value FROM manual_level_rows WHERE user_id <> ''00000000-0000-0000-0000-000000007010'' ORDER BY kind, user_id, value::text',
  'SELECT kind, user_id, value FROM manual_level_expected WHERE user_id <> ''00000000-0000-0000-0000-000000007010'' ORDER BY kind, user_id, value::text',
  'users below lower bound and at exclusive upper bound remain entirely unchanged');
\ir fixtures/remove-level-calculation-offsets.sql.inc
SELECT results_eq('SELECT kind, user_id, value FROM manual_level_rows ORDER BY kind, user_id, value::text',
  'SELECT kind, user_id, value FROM manual_level_expected ORDER BY kind, user_id, value::text',
  'rerunning bounded cleanup is idempotent');
SELECT is(current_setting('tarkovtracker.mode_progress_backfill'), 'off', 'maintenance restores its activity flag');
SELECT * FROM finish();
ROLLBACK;
