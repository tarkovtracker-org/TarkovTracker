BEGIN;
SELECT plan(16);
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

SELECT * FROM finish();
ROLLBACK;
