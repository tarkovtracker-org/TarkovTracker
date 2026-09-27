BEGIN;
SELECT plan(10);

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
   FROM pg_proc
   WHERE oid = 'public.sanitize_user_progress_api_task_updates(jsonb)'::regprocedure),
  'the replaced sanitizer retains its pinned search_path'
);

SELECT ok(
  public.sanitize_user_progress_api_task_updates(
    '[{"id":"active-task","state":"active"},{"id":"completed-task","state":"completed"},{"id":"unknown-task","state":"pending"},{"id":7,"state":"active"},{"id":"","state":"active"},"malformed"]'::jsonb
  ) @> '[{"id":"active-task","state":"active"},{"id":"completed-task","state":"completed"}]'::jsonb
  AND jsonb_array_length(public.sanitize_user_progress_api_task_updates(
    '[{"id":"active-task","state":"active"},{"id":"completed-task","state":"completed"},{"id":"unknown-task","state":"pending"},{"id":7,"state":"active"},{"id":"","state":"active"},"malformed"]'::jsonb
  )) = 2,
  'active and existing known states survive while unknown or malformed task updates are removed'
);
SELECT is(
  public.sanitize_user_progress_api_task_updates('{"id":"active-task","state":"active"}'::jsonb),
  '[]'::jsonb,
  'a non-array task update payload is rejected'
);
SELECT is(
  public.sanitize_user_progress_api_task_updates('[{"id":"unknown-task","state":"pending"},{"id":7,"state":"active"},"malformed"]'::jsonb),
  '[]'::jsonb,
  'unknown states and malformed task updates are rejected'
);

SELECT ok(
  public.sanitize_user_progress_mode_data(
    '{"lastApiUpdate":{"at":1780000000000,"id":"last-active","source":"api","tasks":[{"id":"task-last","state":"active"}]},"apiUpdateHistory":[{"at":1780000000001,"id":"history-active","source":"api","tasks":[{"id":"task-history","state":"active"}]}]}'::jsonb
  )->'lastApiUpdate'->'tasks' @> '[{"id":"task-last","state":"active"}]'::jsonb,
  'mode sanitization preserves active task state in lastApiUpdate'
);
SELECT ok(
  public.sanitize_user_progress_mode_data(
    '{"lastApiUpdate":{"at":1780000000000,"id":"last-active","source":"api","tasks":[{"id":"task-last","state":"active"}]},"apiUpdateHistory":[{"at":1780000000001,"id":"history-active","source":"api","tasks":[{"id":"task-history","state":"active"}]}]}'::jsonb
  )->'apiUpdateHistory' @> '[{"id":"history-active","tasks":[{"id":"task-history","state":"active"}]}]'::jsonb,
  'mode sanitization preserves active task state in apiUpdateHistory'
);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000968', 'api-task-active@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000968', true);
SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":10,"lastApiUpdate":{"at":1780000000000,"id":"last-active","source":"api","tasks":[{"id":"task-last","state":"active"}]},"apiUpdateHistory":[{"at":1780000000001,"id":"history-active","source":"api","tasks":[{"id":"task-history","state":"active"}]}]}}',
  NULL);
RESET ROLE;

SELECT is((SELECT pvp_data->'lastApiUpdate'->'tasks'->0->>'state'
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000968'),
  'active', 'authenticated progress sync persists active lastApiUpdate task state');
SELECT is((SELECT pvp_data->'apiUpdateHistory'->0->'tasks'->0->>'state'
  FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000968'),
  'active', 'authenticated progress sync persists active apiUpdateHistory task state');
SELECT is((SELECT progress_data->'lastApiUpdate'->'tasks'->0->>'state'
  FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000968'
    AND game_mode = 'pvp'),
  'active', 'normalized mode persistence retains active lastApiUpdate task state');
SELECT is((SELECT progress_data->'apiUpdateHistory'->0->'tasks'->0->>'state'
  FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000000968'
    AND game_mode = 'pvp'),
  'active', 'normalized mode persistence retains active apiUpdateHistory task state');

SELECT * FROM finish();
ROLLBACK;
