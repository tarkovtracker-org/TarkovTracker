BEGIN;
SELECT plan(4);

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
  public.sanitize_user_progress_mode_data('{"taskAvailability": ["task"]}'::jsonb)
    ->'taskAvailability',
  '{}'::jsonb,
  'replaces a non-object confirmation map with empty'
);

SELECT is(
  public.sanitize_user_progress_mode_data(
    '{"taskCompletions": {"task": {"complete": true, "timestamp": 5}},
      "taskAvailability": {"task": {"requirements": "", "timestamp": 9}}}'::jsonb
  )->'taskCompletions',
  '{"task": {"complete": true, "timestamp": 5}}'::jsonb,
  'keeps task status independent of confirmations'
);

SELECT * FROM finish();
ROLLBACK;
