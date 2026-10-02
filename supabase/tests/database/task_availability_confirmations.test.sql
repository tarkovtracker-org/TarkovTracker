BEGIN;
SELECT plan(22);

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
    SELECT NOT public.merge_task_availability('{"s1":{"requirements":"old","timestamp":0}}', entries) ? 's1'
      AND NOT public.merge_task_availability(entries, '{"s1":{"requirements":"old","timestamp":0}}') ? 's1'
    FROM (
      SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', n)) AS entries
      FROM generate_series(1, 66) AS n
    ) AS fixture
  ),
  'selects duplicate winners before eviction in either input order'
);

SELECT ok(
  (
    SELECT merged ? 's65' AND NOT merged ? 's66'
    FROM (
      SELECT public.merge_task_availability(NULL, jsonb_object_agg('s' || lpad(n::text, 2, '0'),
        jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', 1))) AS merged
      FROM generate_series(1, 66) AS n
    ) AS fixture
  ),
  'orders equal clocks by task id at the byte boundary'
);

CREATE TEMP TABLE full_confirmations AS
SELECT (
  SELECT jsonb_object_agg('s' || n, jsonb_build_object('requirements', repeat('r', 4000), 'timestamp', n))
  FROM generate_series(1, 65) AS n
) || jsonb_build_object('s66', jsonb_build_object('requirements', repeat('r', 1955), 'timestamp', 66)) AS entries;

SELECT is(
  (SELECT sum(octet_length(entry.key) + octet_length(entry.value->>'requirements'))
   FROM full_confirmations, jsonb_each(entries) AS entry),
  262144::bigint,
  'the eviction fixture starts exactly at the byte budget'
);

SELECT ok(
  (SELECT public.merge_task_availability(NULL, entries) ? 's1' FROM full_confirmations),
  'the oldest confirmation fits before the new entry'
);

SELECT ok(
  (
    SELECT merged ? 'new' AND NOT merged ? 's1'
    FROM (
      SELECT public.merge_manual_activity_progress(
        jsonb_build_object('taskAvailability', (SELECT entries FROM full_confirmations)),
        '{"taskAvailability": {"new": {"requirements": "sig", "timestamp": 1000}}}'
      )->'taskAvailability' AS merged
    ) AS result
  ),
  'a new confirmation evicts the oldest once the map is full'
);

CREATE TEMP VIEW confirmation_upload_roundtrip AS
WITH source AS (
  SELECT jsonb_object_agg('s' || n, jsonb_build_object(
    'requirements', repeat('r', 4000), 'timestamp', 199 + n
  )) AS local_map
  FROM generate_series(1, 66) AS n
), fixture AS (
  SELECT local_map, '{"s1":{"requirements":"old","timestamp":0}}'::jsonb AS remote_map
  FROM source
), resolved AS (
  SELECT *, public.merge_task_availability(local_map, remote_map) AS result_map FROM fixture
)
SELECT result_map,
  public.merge_manual_activity_progress(
    jsonb_build_object('taskAvailability', remote_map),
    jsonb_build_object('taskAvailability', result_map)
  )->'taskAvailability' AS naive_upload,
  public.merge_manual_activity_progress(
    public.merge_manual_activity_progress(
      jsonb_build_object('taskAvailability', remote_map),
      '{"taskAvailability":{"s1":{"requirements":"","timestamp":200}}}'::jsonb
    ),
    jsonb_build_object('taskAvailability', result_map)
  )->'taskAvailability' AS bounded_eviction_pass
FROM resolved;

SELECT is(
  (SELECT naive_upload->'s1'->>'requirements' FROM confirmation_upload_roundtrip),
  'old',
  'an omitted key is not a deletion in the union RPC; a bounded upload alone resurrects the old value'
);
SELECT ok(
  (
    SELECT NOT result_map ? 's1'
      AND bounded_eviction_pass->'s1'->>'requirements' = ''
      AND (SELECT count(*) FROM jsonb_each(bounded_eviction_pass)) <= 1000
      AND (SELECT sum(octet_length(key) + octet_length(value->>'requirements'))
           FROM jsonb_each(bounded_eviction_pass)) <= 262144
    FROM confirmation_upload_roundtrip
  ),
  'a bounded clear pass prevents resurrection without increasing the persisted limits'
);
SELECT ok(
  (
    SELECT result ? '�' AND NOT result ? '😀'
    FROM (
      SELECT public.merge_task_availability(NULL,
        jsonb_object_agg('t' || n, '{"requirements":"","timestamp":1}'::jsonb)
        || '{"�":{"requirements":"","timestamp":1},"😀":{"requirements":"","timestamp":1}}'::jsonb
      ) AS result FROM generate_series(1, 999) AS n
    ) AS fixture
  ),
  'equal timestamp count eviction uses Unicode code-point order, matching client C-collation order'
);

SELECT * FROM finish();
ROLLBACK;
