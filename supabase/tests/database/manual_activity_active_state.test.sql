BEGIN;
SELECT plan(8);

SELECT is(
  public.sanitize_user_progress_manual_activity_entry(
    '{"id":"accept-task","timestamp":1780000000000,"type":"task","action":"active","title":"Accepted task"}'::jsonb
  )->>'action',
  'active',
  'manual task acceptance survives entry sanitization'
);
SELECT is(
  public.sanitize_user_progress_manual_activity_entry(
    '{"id":"invalid-task","timestamp":1780000000000,"type":"task","action":"pending","title":"Invalid action"}'::jsonb
  ),
  NULL::jsonb,
  'unknown manual actions are still rejected'
);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000715', 'manual-active@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000715', true);
SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"manualActivityHistory":[{"id":"accept-task","timestamp":1780000000000,"type":"task","action":"active","title":"Accepted task"},{"id":"invalid-task","timestamp":1780000000001,"type":"task","action":"pending","title":"Invalid action"}]}}',
  NULL);
RESET ROLE;

SELECT is((SELECT pvp_data->'manualActivityHistory'->0->>'action'
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000715'),
  'active', 'authenticated sync persists manual acceptance in legacy progress');
SELECT is((SELECT jsonb_array_length(pvp_data->'manualActivityHistory')
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000715'),
  1, 'authenticated sync removes invalid manual actions from legacy progress');
SELECT is((SELECT progress_data->'manualActivityHistory'->0->>'action'
  FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000715'
    AND game_mode = 'pvp'),
  'active', 'normalized progress retains manual acceptance for subsequent reads');
SELECT is((SELECT jsonb_array_length(progress_data->'manualActivityHistory')
  FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000715'
    AND game_mode = 'pvp'),
  1, 'normalized progress removes invalid manual actions');

SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":2,"taskCompletions":{"accepted":{"complete":false,"failed":false,"active":true,"timestamp":100},"inactive":{"complete":false,"failed":false,"active":false,"timestamp":100}}}}', NULL);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":3,"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":100},"inactive":{"complete":false,"failed":false,"timestamp":100}}}}', NULL);
RESET ROLE;
SELECT is((SELECT pvp_data->'taskCompletions'->'accepted'->'active'
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000715'),
  'true'::jsonb, 'old-client full-mode save retains acceptance in legacy progress');
SELECT is((SELECT progress_data->'taskCompletions'->'inactive'->'active'
  FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000715' AND game_mode = 'pvp'),
  'false'::jsonb, 'old-client full-mode save retains explicit inactive normalized progress');

SELECT * FROM finish();
ROLLBACK;
