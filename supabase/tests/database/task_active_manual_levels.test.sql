BEGIN;
SELECT plan(15);

CREATE TEMP TABLE acceptance_level_fixture AS SELECT
  '{"level":37,"progressEpoch":2,"taskCompletions":{"accepted":{"complete":false,"failed":false,"active":true,"timestamp":100},"inactive":{"complete":false,"failed":false,"active":false,"timestamp":100}}}'::jsonb AS existing,
  '{"level":1,"xpOffset":0,"progressEpoch":2,"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":100},"inactive":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb AS incoming,
  private.active_season_number() AS season_number;
CREATE TEMP TABLE acceptance_level_merge AS SELECT
  public.merge_manual_activity_progress(existing, incoming) AS progress
FROM acceptance_level_fixture;
SELECT is(progress->'level', '37'::jsonb,
  'legacy XP marker freezes saved level while carrying acceptance') FROM acceptance_level_merge;
SELECT is(progress#>'{taskCompletions,accepted,active}', 'true'::jsonb,
  'same legacy XP-bearing merge retains explicit acceptance') FROM acceptance_level_merge;
SELECT is(progress#>'{taskCompletions,inactive,active}', 'false'::jsonb,
  'same legacy XP-bearing merge retains explicit nonacceptance') FROM acceptance_level_merge;
SELECT ok(NOT public.sanitize_user_progress_mode_data(progress) ? 'xpOffset',
  'sanitizing the combined merge removes the obsolete XP marker') FROM acceptance_level_merge;
SELECT is(public.merge_manual_activity_progress(existing, incoming || '{"xpOffset":"0"}') -> 'level',
  '37'::jsonb, 'string XP marker keeps saved-level compatibility') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing, incoming - 'xpOffset') -> 'level',
  '1'::jsonb, 'refreshed client still controls its manual level') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  incoming || '{"taskCompletions":{"accepted":{"complete":true,"failed":false,"timestamp":100}}}')
  #>'{taskCompletions,accepted,active}', 'false'::jsonb,
  'equal-time completion clears acceptance despite the XP marker') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  incoming || '{"taskCompletions":{"accepted":{"complete":false,"failed":true,"timestamp":101}}}')
  #>'{taskCompletions,accepted,active}', 'false'::jsonb,
  'newer failure clears acceptance despite the XP marker') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  incoming || '{"taskCompletions":{"accepted":{"complete":true,"failed":false,"timestamp":99}}}')
  #>'{taskCompletions,accepted}', existing#>'{taskCompletions,accepted}',
  'older terminal writes cannot replace newer acceptance') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing, incoming || '{"progressEpoch":3}') -> 'level',
  '1'::jsonb, 'new reset overrides the cached-client saved-level guard') FROM acceptance_level_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress(existing, incoming || '{"progressEpoch":3}')
  #>'{taskCompletions,accepted}') ? 'active',
  'new reset does not inherit acceptance from the losing epoch') FROM acceptance_level_fixture;
SELECT is(public.merge_manual_activity_progress(existing, incoming || '{"progressEpoch":1}'),
  existing, 'older reset preserves the whole saved progress') FROM acceptance_level_fixture;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000007153', 'acceptance-level-sync@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007153', true);
GRANT SELECT ON acceptance_level_fixture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  (SELECT jsonb_build_object('pvp', existing, 'pve', existing, 'seasonal', existing)
    FROM acceptance_level_fixture), (SELECT season_number FROM acceptance_level_fixture));
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  (SELECT jsonb_build_object('pvp', incoming, 'pve', incoming, 'seasonal', incoming)
    FROM acceptance_level_fixture), (SELECT season_number FROM acceptance_level_fixture));
RESET ROLE;
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007153'
    AND progress_data->'level' = '37'::jsonb), 3::bigint,
  'authenticated legacy save preserves manual levels in all three modes');
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007153'
    AND progress_data#>'{taskCompletions,accepted,active}' = 'true'::jsonb
    AND progress_data#>'{taskCompletions,inactive,active}' = 'false'::jsonb), 3::bigint,
  'same authenticated legacy save preserves both acceptance states in all three modes');
SELECT is((SELECT count(*) FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000007153' AND NOT progress_data ? 'xpOffset'),
  3::bigint, 'same authenticated legacy save discards XP offsets in all three modes');
SELECT * FROM finish();
ROLLBACK;
