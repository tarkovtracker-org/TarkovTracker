BEGIN;
SELECT plan(5);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000892', 'progress-freshness@example.invalid');
DELETE FROM public.user_game_mode_progress
WHERE user_id = '00000000-0000-0000-0000-000000000892';
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
VALUES ('00000000-0000-0000-0000-000000000892', 'pvp', 0, '{"level":10}');
SELECT ok((SELECT progress_updated_at IS NOT NULL FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000892'), 'new progress has a progress timestamp');
UPDATE public.user_game_mode_progress SET progress_updated_at = '2000-01-01' WHERE user_id = '00000000-0000-0000-0000-000000000892';
UPDATE public.user_game_mode_progress SET profile_public = NOT profile_public WHERE user_id = '00000000-0000-0000-0000-000000000892';
SELECT is((SELECT progress_updated_at FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000892'),
  '2000-01-01'::timestamptz, 'visibility does not advance progress freshness');
UPDATE public.user_game_mode_progress SET progress_data = progress_data WHERE user_id = '00000000-0000-0000-0000-000000000892';
SELECT is((SELECT progress_updated_at FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000892'),
  '2000-01-01'::timestamptz, 'an unchanged sanitized payload does not advance progress freshness');
UPDATE public.user_game_mode_progress SET progress_updated_at = NULL WHERE user_id = '00000000-0000-0000-0000-000000000892';
UPDATE public.user_game_mode_progress SET profile_public = NOT profile_public WHERE user_id = '00000000-0000-0000-0000-000000000892';
SELECT ok((SELECT progress_updated_at IS NULL FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000892'), 'unknown historical freshness stays unknown after a visibility change');
UPDATE public.user_game_mode_progress SET progress_data = '{"level":11}' WHERE user_id = '00000000-0000-0000-0000-000000000892';
SELECT ok((SELECT progress_updated_at > '2000-01-01'::timestamptz FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000892'), 'changed progress advances its own freshness');
SELECT * FROM finish();
ROLLBACK;
