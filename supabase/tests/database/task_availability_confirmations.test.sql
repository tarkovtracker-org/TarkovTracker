BEGIN;
SELECT plan(9);

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

SELECT * FROM finish();
ROLLBACK;
