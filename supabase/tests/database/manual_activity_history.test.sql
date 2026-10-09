BEGIN;
SELECT plan(16);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000893', 'manual-history@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000893', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":10,"manualActivityHistory":[{"id":"first","timestamp":1000,"type":"task","action":"complete","title":"First"}]},"seasonal":{"level":3,"manualActivityHistory":[{"id":"season","timestamp":1000,"type":"task","action":"complete","title":"Season"}]}}',
  private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11},"seasonal":{"level":4}}', private.active_season_number());
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'id' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), 'first', 'old-client omission preserves stored history');
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'id' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode='seasonal'), 'season', 'old-client omission preserves Seasonal history');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityHistory":[{"id":"second","timestamp":2000,"type":"task","action":"complete","title":"Second"}]}}', private.active_season_number());
SELECT is((SELECT jsonb_array_length(progress_data->'manualActivityHistory') FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), 2, 'independent device histories are unioned');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[]}}', private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityHistory":[{"id":"first","timestamp":1000,"type":"task","action":"complete","title":"First"}]}}', private.active_season_number());
SELECT is((SELECT progress_data->'manualActivityHistory' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), '[]'::jsonb, 'stale device cannot undo clear');
SELECT is((SELECT progress_data->>'manualActivityEpoch' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), '1', 'clear generation survives old-client writes');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[{"id":"after-clear","timestamp":3000,"type":"task","action":"complete","title":"After"}]}}', private.active_season_number());
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'id' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), 'after-clear', 'new entries after a clear are retained');
SELECT is((SELECT pvp_data->'manualActivityHistory' FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000893'),
  '[]'::jsonb, 'history syncs no longer reach the legacy column');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":1,"progressEpoch":1}}', private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[{"id":"after-clear","timestamp":3000,"type":"task","action":"complete","title":"After"}]}}', private.active_season_number());
SELECT is((SELECT progress_data->'manualActivityHistory' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), '[]'::jsonb, 'full reset defeats stale history including higher history generation');
SELECT is((SELECT progress_data->>'progressEpoch' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode = 'pvp'), '1', 'stale device cannot lower the full reset epoch');
SELECT is(public.sanitize_user_progress_manual_activity_history(
  '[{"id":"x","timestamp":1,"type":"task","action":"complete","title":"Z"},{"id":"x","timestamp":1,"type":"task","action":"complete","title":"A"}]')->0->>'title', 'A', 'same-ID ties use deterministic text ordering');
SELECT is(public.sanitize_user_progress_manual_activity_history(
  '[{"id":"z","timestamp":1,"type":"task","action":"complete","title":"Z"},{"id":"a","timestamp":1,"type":"task","action":"complete","title":"A"}]')->0->>'id', 'a', 'timestamp ties sort by ID inside the aggregate');
-- An account whose normalized row is an unmaterialized placeholder merges from that row alone:
-- the frozen legacy column is never a merge base (#1028), and the account row is not rewritten.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000894', 'manual-history-placeholder@example.invalid');
-- handle_new_user() already created the account row; give it frozen legacy progress.
UPDATE public.user_progress
SET pvp_data = '{"level":42,"progressEpoch":3,"taskCompletions":{"kept":{"complete":true}},"manualActivityHistory":[{"id":"legacy","timestamp":5000,"type":"task","action":"complete","title":"Legacy"}]}'
WHERE user_id = '00000000-0000-0000-0000-000000000894';
-- Create the placeholder shape the visibility RPC leaves behind. Only an INSERT reaches that
-- shape, because the row trigger merges every UPDATE.
DELETE FROM public.user_game_mode_progress
WHERE user_id = '00000000-0000-0000-0000-000000000894' AND game_mode = 'pvp' AND season_number = 0;
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
VALUES ('00000000-0000-0000-0000-000000000894', 'pvp', 0, '{}'::jsonb);
CREATE TEMP TABLE placeholder_account_row AS
SELECT ctid::text AS row_version FROM public.user_progress
WHERE user_id = '00000000-0000-0000-0000-000000000894';
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000894', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":1,"manualActivityHistory":[{"id":"stale","timestamp":6000,"type":"task","action":"complete","title":"Stale"}]}}',
  private.active_season_number());
SELECT is((SELECT progress_data->>'level' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000894' AND game_mode = 'pvp'), '1',
  'a placeholder row does not seed from the frozen legacy reset epoch');
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'id' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000894' AND game_mode = 'pvp'), 'stale',
  'a placeholder row does not union the frozen legacy history');
SELECT isnt((SELECT ctid::text FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000894'),
  (SELECT row_version FROM placeholder_account_row),
  'a placeholder sync retains the cached-client compatibility clock');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000893', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '{"pvp":{"progressEpoch":1}}')$$, 'authenticated RPC retains helper permissions');
SELECT throws_ok($$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '{"bad":{}}')$$, 'P0001', 'Unsupported game mode: bad', 'RPC still rejects unsupported modes');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
