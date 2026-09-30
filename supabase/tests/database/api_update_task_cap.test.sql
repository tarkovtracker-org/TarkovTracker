BEGIN;
SELECT plan(14);

CREATE TEMP TABLE cap_fixture ON COMMIT DROP AS
SELECT jsonb_agg(
  jsonb_build_object('id', 'task-' || n, 'state', CASE WHEN n = 1 THEN 'active' ELSE 'completed' END)
  ORDER BY n
) AS tasks
FROM generate_series(1, 25) AS n;
GRANT SELECT ON cap_fixture TO authenticated;

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
   FROM pg_proc
   WHERE oid = 'public.sanitize_user_progress_api_update_meta(jsonb)'::regprocedure),
  'the replaced meta sanitizer retains its pinned search_path'
);

SELECT is(
  public.sanitize_user_progress_api_task_updates(
    '[{"id":"z","state":"failed"},{"id":"a","state":"active"},{"id":"m","state":"completed"}]'::jsonb
  ),
  '[{"id":"z","state":"failed"},{"id":"a","state":"active"},{"id":"m","state":"completed"}]'::jsonb,
  'task updates keep input order'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    jsonb_build_object('at', 1, 'id', 'batch', 'source', 'api', 'tasks', (SELECT tasks FROM cap_fixture))
  ),
  jsonb_build_object(
    'at', 1, 'id', 'batch', 'source', 'api', 'taskCount', 25,
    'tasks', (SELECT jsonb_agg(value ORDER BY ordinality)
              FROM jsonb_array_elements((SELECT tasks FROM cap_fixture)) WITH ORDINALITY
              WHERE ordinality <= 20)
  ),
  'meta keeps the first 20 valid task updates and records the total'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    public.sanitize_user_progress_api_update_meta(
      jsonb_build_object('at', 1, 'id', 'batch', 'source', 'api', 'tasks', (SELECT tasks FROM cap_fixture))
    )
  ),
  public.sanitize_user_progress_api_update_meta(
    jsonb_build_object('at', 1, 'id', 'batch', 'source', 'api', 'tasks', (SELECT tasks FROM cap_fixture))
  ),
  'meta sanitization is idempotent after truncation'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    '{"at":1,"id":"small","source":"api","taskCount":2,"tasks":[{"id":"a","state":"completed"},{"id":"","state":"completed"},{"id":"b","state":"pending"}]}'::jsonb
  ),
  '{"at":1,"id":"small","source":"api","tasks":[{"id":"a","state":"completed"}],"taskCount":2}'::jsonb,
  'a stored count above the kept list survives'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    '{"at":1,"id":"exact","source":"api","taskCount":1,"tasks":[{"id":"a","state":"completed"}]}'::jsonb
  ),
  '{"at":1,"id":"exact","source":"api","tasks":[{"id":"a","state":"completed"}]}'::jsonb,
  'a count that does not exceed the kept list is dropped'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    '{"at":1,"id":"clamped","source":"api","taskCount":50.9}'::jsonb
  )->'taskCount',
  '50'::jsonb,
  'fractional counts truncate'
);

SELECT is(
  public.sanitize_user_progress_api_update_meta(
    '{"at":1,"id":"clamped","source":"api","taskCount":1e12}'::jsonb
  )->'taskCount',
  '1000000'::jsonb,
  'oversized counts clamp to the shared maximum'
);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000990', 'api-task-cap@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000990', true);
SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  jsonb_build_object('pvp', jsonb_build_object(
    'level', 10,
    'apiUpdateHistory', jsonb_build_array(
      jsonb_build_object('at', 1780000000000, 'id', 'history-batch', 'source', 'api',
        'tasks', (SELECT tasks FROM cap_fixture))
    )
  )),
  NULL);
RESET ROLE;

SELECT ok(
  (SELECT jsonb_array_length(progress_data->'apiUpdateHistory'->0->'tasks') = 20
     AND progress_data->'apiUpdateHistory'->0->'taskCount' = '25'::jsonb
   FROM public.user_game_mode_progress
   WHERE user_id = '00000000-0000-0000-0000-000000000990' AND game_mode = 'pvp'),
  'authenticated progress sync persists capped apiUpdateHistory entries'
);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000992', 'api-task-cap-gateway@example.invalid');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000000992', 'pvp_data', NULL, NULL,
  jsonb_build_object('level', 5, 'lastApiUpdate', jsonb_build_object(
    'at', 1780000000000, 'id', 'first-write', 'source', 'api', 'taskCount', 30,
    'tasks', (SELECT jsonb_agg(value ORDER BY ordinality)
              FROM jsonb_array_elements((SELECT tasks FROM cap_fixture)) WITH ORDINALITY
              WHERE ordinality <= 20))));
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000000992', 'pvp_data', NULL, NULL,
  jsonb_build_object('lastApiUpdate', jsonb_build_object(
    'at', 1780000000001, 'id', 'second-write', 'source', 'api', 'tasks', (SELECT tasks FROM cap_fixture))));

SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(entry->>'id', jsonb_array_length(entry->'tasks'), entry->'taskCount'))
   FROM public.user_game_mode_progress,
     jsonb_array_elements(progress_data->'apiUpdateHistory') AS entry
   WHERE user_id = '00000000-0000-0000-0000-000000000992' AND game_mode = 'pvp'),
  '[["second-write", 20, 25], ["first-write", 20, 30]]'::jsonb,
  'API writes keep capped entries and earlier counts in normalized progress'
);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(entry->>'id', jsonb_array_length(entry->'tasks'), entry->'taskCount'))
   FROM public.user_progress, jsonb_array_elements(pvp_data->'apiUpdateHistory') AS entry
   WHERE user_id = '00000000-0000-0000-0000-000000000992'),
  '[["second-write", 20, 25], ["first-write", 20, 30]]'::jsonb,
  'the legacy history trigger carries taskCount through to the mirrored row'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000990', true);
SET LOCAL ROLE authenticated;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  jsonb_build_object('pvp', jsonb_build_object(
    'level', 10,
    'lastApiUpdate', jsonb_build_object('at', 1780000000000, 'id', 'history-batch', 'source', 'api',
      'tasks', (SELECT jsonb_agg(value ORDER BY ordinality)
                FROM jsonb_array_elements((SELECT tasks FROM cap_fixture)) WITH ORDINALITY
                WHERE ordinality <= 20)),
    'apiUpdateHistory', jsonb_build_array(
      jsonb_build_object('at', 1780000000000, 'id', 'history-batch', 'source', 'api',
        'tasks', (SELECT jsonb_agg(value ORDER BY ordinality)
                  FROM jsonb_array_elements((SELECT tasks FROM cap_fixture)) WITH ORDINALITY
                  WHERE ordinality <= 20))
    )
  )),
  NULL);
RESET ROLE;

SELECT is(
  (SELECT jsonb_build_array(
     progress_data->'lastApiUpdate'->'taskCount',
     progress_data->'apiUpdateHistory'->0->'taskCount')
   FROM public.user_game_mode_progress
   WHERE user_id = '00000000-0000-0000-0000-000000000990' AND game_mode = 'pvp'),
  '[25, 25]'::jsonb,
  'a client sync that omits taskCount keeps the stored count for the same entry'
);

UPDATE public.user_progress
SET pvp_data = pvp_data || jsonb_build_object(
  'apiUpdateHistory', jsonb_build_array(
    jsonb_build_object('at', 1780000000000, 'id', 'first-write', 'source', 'api',
      'tasks', pvp_data->'apiUpdateHistory'->1->'tasks')
  )
)
WHERE user_id = '00000000-0000-0000-0000-000000000992';

SELECT is(
  (SELECT entry->'taskCount'
   FROM public.user_progress, jsonb_array_elements(pvp_data->'apiUpdateHistory') AS entry
   WHERE user_id = '00000000-0000-0000-0000-000000000992' AND entry->>'id' = 'first-write'),
  '30'::jsonb,
  'the legacy history trigger keeps the stored count when a resent entry omits it'
);

SELECT is(
  (SELECT jsonb_agg(entry.value->'taskCount' ORDER BY entry.ordinality)
   FROM jsonb_array_elements(
     public.carry_api_update_task_counts(
       jsonb_build_object('apiUpdateHistory', (
         SELECT jsonb_agg(jsonb_build_object('id', 'e' || n, 'at', n, 'source', 'api', 'taskCount', 30))
         FROM generate_series(1, 51) AS n)),
       jsonb_build_object('apiUpdateHistory', (
         SELECT jsonb_agg(jsonb_build_object('id', 'e' || n, 'at', n, 'source', 'api') ORDER BY n)
         FROM generate_series(50, 51) AS n))
     )->'apiUpdateHistory'
   ) WITH ORDINALITY AS entry(value, ordinality)),
  '[30, null]'::jsonb,
  'taskCount carry-over scans only the first 50 stored history entries'
);

SELECT * FROM finish();
ROLLBACK;
