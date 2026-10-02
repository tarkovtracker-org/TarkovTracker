BEGIN;
SELECT plan(10);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000961', 'uid-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000962', 'uid-claimant@example.invalid');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', true);
SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, 1001, '{"pvp":{"level":10}}', NULL) - 'metadata_write_id',
  '{"tarkov_uid": 1001, "tarkov_uid_conflict": false}'::jsonb,
  'an unowned UID links and is reported as stored'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', true);
SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, 1001, '{"pvp":{"level":15}}', NULL) - 'metadata_write_id',
  '{"tarkov_uid": null, "tarkov_uid_conflict": true}'::jsonb,
  'a UID owned by another account is reported as a conflict on first sync'
);
SELECT is(
  (SELECT (progress_data->>'level')::int FROM public.user_game_mode_progress
   WHERE user_id = '00000000-0000-0000-0000-000000000962' AND game_mode = 'pvp'),
  15,
  'the conflicting link does not roll back progress'
);
SELECT is(
  (SELECT tarkov_uid FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000961'),
  1001::bigint,
  'the owning account keeps its link'
);

SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, 1002, '{"pvp":{"level":16}}', NULL) - 'metadata_write_id',
  '{"tarkov_uid": 1002, "tarkov_uid_conflict": false}'::jsonb,
  'a corrected UID links on the next sync'
);
SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, 1001, '{"pvp":{"level":17}}', NULL) - 'metadata_write_id',
  '{"tarkov_uid": 1002, "tarkov_uid_conflict": true}'::jsonb,
  'a conflicting relink keeps the existing link'
);
SELECT is(
  (SELECT (progress_data->>'level')::int FROM public.user_game_mode_progress
   WHERE user_id = '00000000-0000-0000-0000-000000000962' AND game_mode = 'pvp'),
  17,
  'progress from the conflicting relink is saved'
);

SELECT lives_ok(
  $$SELECT public.archive_prestige_run_and_reset_progress(
    'pvp', 0, 1, '{"level":17}', '{}', now(), 'pvp', 1, 1001, '{"level":1,"prestigeLevel":1}', '{}')$$,
  'a prestige carrying a conflicting UID still archives'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', true);
SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, NULL, '{}', NULL) - 'metadata_write_id',
  '{"tarkov_uid": null, "tarkov_uid_conflict": false}'::jsonb,
  'unlinking releases the UID'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', true);
SELECT is(
  public.sync_user_game_mode_progress('pvp', 1, 1001, '{}', NULL)->'tarkov_uid',
  '1001'::jsonb,
  'a released UID can be linked by another account'
);

SELECT * FROM finish();
ROLLBACK;
