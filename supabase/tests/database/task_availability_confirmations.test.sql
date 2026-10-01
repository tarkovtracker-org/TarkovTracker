BEGIN;
SELECT plan(15);

SELECT is(
  public.sanitize_user_progress_mode_data(
    '{"taskAvailability": {"task": {"requirements": "sig", "timestamp": 10}}}'::jsonb
  )->'taskAvailability',
  '{"task": {"requirements": "sig", "timestamp": 10}}'::jsonb,
  'keeps availability confirmations'
);

SELECT is(
  public.sanitize_user_progress_mode_data('{}'::jsonb)->'taskAvailability',
  '{}'::jsonb,
  'defaults a missing confirmation map to empty'
);

SELECT is(
  public.sanitize_user_progress_mode_data(
    '{"taskAvailability": {
      "ok": {"requirements": "", "timestamp": 7.9},
      "noClock": {"requirements": "sig"},
      "negative": {"requirements": "sig", "timestamp": -1},
      "wrongType": {"requirements": 1, "timestamp": 1},
      "notObject": "sig"
    }}'::jsonb
  )->'taskAvailability',
  '{"ok": {"requirements": "", "timestamp": 7}}'::jsonb,
  'drops malformed entries and truncates the clock'
);

SELECT is(
  public.sanitize_user_progress_mode_data(
    '{"taskCompletions": {"task": {"complete": true, "timestamp": 5}},
      "taskAvailability": {"task": {"requirements": "", "timestamp": 9}}}'::jsonb
  )->'taskCompletions',
  '{"task": {"complete": true, "timestamp": 5}}'::jsonb,
  'keeps task status independent of confirmations'
);

SELECT is(
  public.merge_task_availability(
    '{"a": {"requirements": "old", "timestamp": 5}, "b": {"requirements": "", "timestamp": 9}}',
    '{"a": {"requirements": "new", "timestamp": 6}, "b": {"requirements": "stale", "timestamp": 3}}'
  ),
  '{"a": {"requirements": "new", "timestamp": 6}, "b": {"requirements": "", "timestamp": 9}}'::jsonb,
  'merges each task by the newest confirmation timestamp'
);

SELECT is(
  public.merge_task_availability(
    '{"a": {"requirements": "stored", "timestamp": 5}}',
    '{"a": {"requirements": "incoming", "timestamp": 5}}'
  )->'a'->>'requirements',
  'incoming',
  'lets the incoming entry win a timestamp tie'
);

SELECT is(
  public.merge_manual_activity_progress(
    '{"taskAvailability": {"a": {"requirements": "sig", "timestamp": 5}}}',
    '{"level": 3}'
  )->'taskAvailability',
  '{"a": {"requirements": "sig", "timestamp": 5}}'::jsonb,
  'a write without the key keeps stored confirmations'
);

SELECT is(
  public.merge_manual_activity_progress(
    '{"taskAvailability": {"a": {"requirements": "", "timestamp": 9}}}',
    '{"taskAvailability": {"a": {"requirements": "sig", "timestamp": 5}}}'
  )->'taskAvailability',
  '{"a": {"requirements": "", "timestamp": 9}}'::jsonb,
  'a stale write cannot resurrect a newer clear'
);

SELECT is(
  public.merge_manual_activity_progress(
    '{"progressEpoch": 1, "taskAvailability": {"a": {"requirements": "sig", "timestamp": 5}}}',
    '{"progressEpoch": 2}'
  )->'taskAvailability',
  NULL,
  'a newer progress reset replaces the row, including confirmations'
);

SELECT is(
  public.merge_task_availability(
    NULL,
    '{"max": {"requirements": "", "timestamp": 32503680000000},
      "beyond": {"requirements": "", "timestamp": 32503680000001},
      "unsafe": {"requirements": "", "timestamp": 9007199254740992}}'
  ),
  '{"max": {"requirements": "", "timestamp": 32503680000000}}'::jsonb,
  'rejects clocks after the client ceiling, leaving successors persistable'
);

SELECT is(
  public.merge_task_availability(
    NULL,
    jsonb_build_object(
      'ok', jsonb_build_object('requirements', repeat('r', 4096), 'timestamp', 1),
      'long', jsonb_build_object('requirements', repeat('r', 4097), 'timestamp', 1),
      repeat('k', 64), jsonb_build_object('requirements', '', 'timestamp', 1),
      repeat('k', 65), jsonb_build_object('requirements', '', 'timestamp', 1)
    )
  ) ?& ARRAY['ok', repeat('k', 64)]
  AND NOT public.merge_task_availability(
    NULL,
    jsonb_build_object(
      'long', jsonb_build_object('requirements', repeat('r', 4097), 'timestamp', 1),
      repeat('k', 65), jsonb_build_object('requirements', '', 'timestamp', 1)
    )
  ) ?| ARRAY['long', repeat('k', 65)],
  true,
  'drops over-long task ids and requirements'
);

SELECT is(
  (
    SELECT count(*)
    FROM jsonb_object_keys(
      public.merge_task_availability(
        (
          SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', 'sig', 'timestamp', n))
          FROM generate_series(1, 700) AS n
        ),
        (
          SELECT jsonb_object_agg('i' || n, jsonb_build_object('requirements', 'sig', 'timestamp', 1000 + n))
          FROM generate_series(1, 700) AS n
        )
      )
    )
  ),
  1000::bigint,
  'caps the merged map at 1000 entries'
);

SELECT is(
  public.merge_task_availability(
    (
      SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', 'sig', 'timestamp', n))
      FROM generate_series(1, 700) AS n
    ),
    (
      SELECT jsonb_object_agg('i' || n, jsonb_build_object('requirements', 'sig', 'timestamp', 1000 + n))
      FROM generate_series(1, 700) AS n
    )
  ) ?& ARRAY['i1', 's401'] AND NOT public.merge_task_availability(
    (
      SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', 'sig', 'timestamp', n))
      FROM generate_series(1, 700) AS n
    ),
    (
      SELECT jsonb_object_agg('i' || n, jsonb_build_object('requirements', 'sig', 'timestamp', 1000 + n))
      FROM generate_series(1, 700) AS n
    )
  ) ? 's400',
  true,
  'keeps the newest confirmations when trimming'
);

SELECT is(
  (
    SELECT sum(octet_length(entry.key) + octet_length(entry.value->>'requirements'))
    FROM jsonb_each(
      public.merge_manual_activity_progress(
        jsonb_build_object('taskAvailability', (
          SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', n))
          FROM generate_series(1, 60) AS n
        )),
        jsonb_build_object('taskAvailability', (
          SELECT jsonb_object_agg('i' || n, jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', 100 + n))
          FROM generate_series(1, 60) AS n
        ))
      )->'taskAvailability'
    ) AS entry
  ) <= 262144,
  true,
  'bounds the merged map size across same-epoch writes'
);

SELECT ok(
  (
    SELECT merged ? 'new' AND NOT merged ? 's1'
    FROM (
      SELECT public.merge_manual_activity_progress(
        jsonb_build_object('taskAvailability', (
          SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', n))
          FROM generate_series(1, 66) AS n
        )),
        '{"taskAvailability": {"new": {"requirements": "sig", "timestamp": 1000}}}'
      )->'taskAvailability' AS merged
    ) AS result
  ),
  'a new confirmation evicts the oldest once the map is full'
);

SELECT * FROM finish();
ROLLBACK;
