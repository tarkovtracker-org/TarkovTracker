BEGIN;
SELECT plan(11);
-- Accepted pre-#1087 clients compare the aggregate normalized clock to the account clock.
-- A persistent write must keep that contract without restoring the legacy JSON mirror.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000001086', 'progress-clock@example.invalid');
ALTER TABLE public.user_progress DISABLE TRIGGER set_user_progress_updated_at;
UPDATE public.user_progress SET updated_at = now() - interval '1 day'
WHERE user_id = '00000000-0000-0000-0000-000000001086';
ALTER TABLE public.user_progress ENABLE TRIGGER set_user_progress_updated_at;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001086', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":20,"traders":{"prapor":{"level":2,"reputation":0.2}},"skills":{"Endurance":3}},"pve":{"level":10}}',
  private.active_season_number());
SELECT ok((SELECT a.updated_at >= max(m.progress_updated_at)
  FROM public.user_progress a JOIN public.user_game_mode_progress m USING (user_id)
  WHERE a.user_id = '00000000-0000-0000-0000-000000001086' GROUP BY a.updated_at),
  'persistent sync keeps the account clock at least as fresh as normalized progress');
CREATE TEMP TABLE saved_account AS SELECT ctid::text AS row_version
FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000001086';
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":20,"traders":{"prapor":{"level":2,"reputation":0.2}},"skills":{"Endurance":3}},"pve":{"level":10}}',
  private.active_season_number());
SELECT is((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  (SELECT row_version FROM saved_account), 'identical sync does not rewrite the compatibility clock');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"seasonal":{"level":3}}', private.active_season_number());
SELECT is((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  (SELECT row_version FROM saved_account), 'Seasonal client sync retains its independent clock');
ALTER TABLE public.user_progress DISABLE TRIGGER set_user_progress_updated_at;
UPDATE public.user_progress SET updated_at = now() - interval '1 day'
WHERE user_id = '00000000-0000-0000-0000-000000001086';
ALTER TABLE public.user_progress ENABLE TRIGGER set_user_progress_updated_at;
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001086', 'pvp_data',
  NULL, NULL, '{"level":19}');
SELECT ok((SELECT a.updated_at >= m.progress_updated_at
  FROM public.user_progress a JOIN public.user_game_mode_progress m USING (user_id)
  WHERE a.user_id = '00000000-0000-0000-0000-000000001086' AND m.game_mode = 'pvp'),
  'PvP API write retains the account clock contract');
ALTER TABLE public.user_progress DISABLE TRIGGER set_user_progress_updated_at;
UPDATE public.user_progress SET updated_at = now() - interval '1 day'
WHERE user_id = '00000000-0000-0000-0000-000000001086';
ALTER TABLE public.user_progress ENABLE TRIGGER set_user_progress_updated_at;
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001086', 'pve_data',
  NULL, NULL, '{"level":9}');
SELECT ok((SELECT a.updated_at >= m.progress_updated_at
  FROM public.user_progress a JOIN public.user_game_mode_progress m USING (user_id)
  WHERE a.user_id = '00000000-0000-0000-0000-000000001086' AND m.game_mode = 'pve'),
  'PvE API write retains the account clock contract');
-- Each API call is normally its own transaction. These fixtures share one timestamp/marker,
-- so take a fresh tuple snapshot before each identical request to prove an account write.
CREATE TEMP TABLE api_noop_account_before AS SELECT ctid::text AS row_version
FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000001086';
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001086', 'pvp_data',
  NULL, NULL, '{"level":19}');
SELECT isnt((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  (SELECT row_version FROM api_noop_account_before), 'identical PvP API request still writes the account clock');
UPDATE api_noop_account_before SET row_version = (SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001086', 'pve_data',
  NULL, NULL, '{"level":9}');
SELECT isnt((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  (SELECT row_version FROM api_noop_account_before), 'identical PvE API request still writes the account clock');
UPDATE api_noop_account_before SET row_version = (SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001086', 'seasonal_data',
  NULL, NULL, '{"level":3}');
SELECT isnt((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  (SELECT row_version FROM api_noop_account_before), 'identical Seasonal API request still writes the account clock');
SELECT is((SELECT current_game_mode FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001086'), 'pvp',
  'API clock advancement does not change selected mode');
SELECT ok((SELECT pvp_data->>'level' IS NULL AND pve_data->>'level' IS NULL
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000001086'),
  'compatibility clocks do not restore legacy JSON writes');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.merge_progress_data(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'compatibility does not broaden API write access');
SELECT * FROM finish();
ROLLBACK;
