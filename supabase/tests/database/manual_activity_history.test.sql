BEGIN;
SELECT plan(13);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000893', 'manual-history@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000893', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":10,"manualActivityHistory":[{"id":"first","timestamp":1000,"type":"task","action":"complete","title":"First"}]},"seasonal":{"level":3,"manualActivityHistory":[{"id":"season","timestamp":1000,"type":"task","action":"complete","title":"Season"}]}}',
  private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11},"seasonal":{"level":4}}', private.active_season_number());
SELECT is((SELECT pvp_data->'manualActivityHistory'->0->>'id' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), 'first', 'old-client omission preserves legacy history');
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'id' FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode='seasonal'), 'season', 'old-client omission preserves Seasonal history');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityHistory":[{"id":"second","timestamp":2000,"type":"task","action":"complete","title":"Second"}]}}', private.active_season_number());
SELECT is((SELECT jsonb_array_length(pvp_data->'manualActivityHistory') FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), 2, 'independent device histories are unioned');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[]}}', private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityHistory":[{"id":"first","timestamp":1000,"type":"task","action":"complete","title":"First"}]}}', private.active_season_number());
SELECT is((SELECT pvp_data->'manualActivityHistory' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), '[]'::jsonb, 'stale device cannot undo clear');
SELECT is((SELECT pvp_data->>'manualActivityEpoch' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), '1', 'clear generation survives old-client writes');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[{"id":"after-clear","timestamp":3000,"type":"task","action":"complete","title":"After"}]}}', private.active_season_number());
SELECT is((SELECT pvp_data->'manualActivityHistory'->0->>'id' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), 'after-clear', 'new entries after a clear are retained');
SELECT is((SELECT pvp_data FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000893'),
  (SELECT progress_data FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000893' AND game_mode='pvp'), 'legacy and normalized histories match');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":1,"progressEpoch":1}}', private.active_season_number());
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11,"manualActivityEpoch":1,"manualActivityHistory":[{"id":"after-clear","timestamp":3000,"type":"task","action":"complete","title":"After"}]}}', private.active_season_number());
SELECT is((SELECT pvp_data->'manualActivityHistory' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), '[]'::jsonb, 'full reset defeats stale history including higher history generation');
SELECT is((SELECT pvp_data->>'progressEpoch' FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000893'), '1', 'stale device cannot lower the full reset epoch');
SELECT is(public.sanitize_user_progress_manual_activity_history(
  '[{"id":"x","timestamp":1,"type":"task","action":"complete","title":"Z"},{"id":"x","timestamp":1,"type":"task","action":"complete","title":"A"}]')->0->>'title', 'A', 'same-ID ties use deterministic text ordering');
SELECT is(public.sanitize_user_progress_manual_activity_history(
  '[{"id":"z","timestamp":1,"type":"task","action":"complete","title":"Z"},{"id":"a","timestamp":1,"type":"task","action":"complete","title":"A"}]')->0->>'id', 'a', 'timestamp ties sort by ID inside the aggregate');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '{"pvp":{"progressEpoch":1}}')$$, 'authenticated RPC retains helper permissions');
SELECT throws_ok($$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '{"bad":{}}')$$, 'P0001', 'Unsupported game mode: bad', 'RPC still rejects unsupported modes');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
