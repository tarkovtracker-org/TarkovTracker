BEGIN;
SELECT plan(39);
CREATE TEMP TABLE active_fixture AS SELECT
  '{"progressEpoch":0,"taskCompletions":{"accepted":{"complete":false,"failed":false,"active":true,"timestamp":100},"inactive":{"complete":false,"failed":false,"active":false,"timestamp":100}}}'::jsonb AS existing;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"level":2,"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":100},"inactive":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'true'::jsonb, 'unchanged legacy full save retains accepted state') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"inactive":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'inactive'->'active', 'false'::jsonb, 'unchanged legacy save retains explicit inactive state') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":99}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'true'::jsonb, 'older neutral legacy save cannot erase acceptance') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":true,"failed":false,"timestamp":101}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'false'::jsonb, 'newer legacy completion clears acceptance') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":false,"failed":true,"timestamp":101}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'false'::jsonb, 'newer legacy failure clears acceptance') FROM active_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":101}}}'::jsonb
)->'taskCompletions'->'accepted' ? 'active'), 'newer legacy neutral reset leaves acceptance unknown') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":true,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'false'::jsonb, 'equal timestamp terminal state cannot resurrect acceptance') FROM active_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress(existing,
  '{"progressEpoch":1,"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'accepted' ? 'active'), 'newer progress reset does not inherit acceptance') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing || '{"progressEpoch":1}'::jsonb,
  '{"progressEpoch":0,"taskCompletions":{}}'::jsonb)->'taskCompletions'->'accepted'->'active',
  'true'::jsonb, 'older reset epoch preserves existing progress') FROM active_fixture;
CREATE TEMP TABLE sequential_merge AS SELECT public.merge_manual_activity_progress(
  public.merge_manual_activity_progress(existing,
    '{"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":99}}}'::jsonb),
  '{"taskCompletions":{"accepted":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
) AS progress FROM active_fixture;
SELECT is(progress->'taskCompletions'->'accepted'->'active', 'true'::jsonb,
  'successive older then unchanged legacy saves retain acceptance') FROM sequential_merge;
SELECT is(progress->'taskCompletions'->'accepted'->'timestamp', '100'::jsonb,
  'carrying acceptance never downgrades its status timestamp') FROM sequential_merge;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":true,"failed":false,"timestamp":99}}}'::jsonb
)->'taskCompletions'->'accepted', existing->'taskCompletions'->'accepted',
  'older legacy completion cannot replace newer acceptance') FROM active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":false,"failed":true,"timestamp":99}}}'::jsonb
)->'taskCompletions'->'accepted', existing->'taskCompletions'->'accepted',
  'older legacy failure cannot replace newer acceptance') FROM active_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress('{}'::jsonb,
  '{"taskCompletions":{"legacy":{"complete":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'legacy' ? 'active'), 'legacy-only progress never gains an invented flag');
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"accepted":{"complete":false,"failed":false,"active":false,"timestamp":101}}}'::jsonb
)->'taskCompletions'->'accepted'->'active', 'false'::jsonb, 'explicit new-client inactive write stays authoritative') FROM active_fixture;
-- Same equal-time legacy-reset fixtures as the browser merge regression. The raw stored
-- acceptance flag remains authoritative even on a malformed terminal row with active:true.
CREATE TEMP TABLE terminal_active_fixture AS
SELECT jsonb_build_object('taskCompletions', jsonb_build_object('task', jsonb_build_object(
  'complete', true, 'failed', failed, 'active', active, 'timestamp', 100
))) AS existing, active
FROM (VALUES (false), (true)) AS failures(failed)
CROSS JOIN (VALUES (false), (true)) AS flags(active);
SELECT is(public.carry_task_active_flags(existing,
  '{"taskCompletions":{"task":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'task', jsonb_build_object(
  'complete', false, 'failed', false, 'active', active, 'timestamp', 100
), 'equal-time legacy reset retains the raw stored flag through direct SQL carry') FROM terminal_active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"task":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'task', jsonb_build_object(
  'complete', false, 'failed', false, 'active', active, 'timestamp', 100
), 'equal-time legacy reset matches browser acceptance through mode-progress merge') FROM terminal_active_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"task":{"complete":false,"failed":false,"timestamp":101}}}'::jsonb
)->'taskCompletions'->'task' ? 'active'), 'newer legacy reset still leaves acceptance unknown') FROM terminal_active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  '{"taskCompletions":{"task":{"complete":false,"failed":false,"timestamp":99}}}'::jsonb
)->'taskCompletions'->'task', existing->'taskCompletions'->'task',
  'older legacy reset preserves the whole newer terminal entry') FROM terminal_active_fixture;
SELECT ok(NOT (public.merge_manual_activity_progress(existing,
  '{"progressEpoch":1,"taskCompletions":{"task":{"complete":false,"failed":false,"timestamp":100}}}'::jsonb
)->'taskCompletions'->'task' ? 'active'), 'newer reset epoch never inherits a terminal row flag') FROM terminal_active_fixture;
SELECT is(public.merge_manual_activity_progress(existing,
  jsonb_build_object('taskCompletions', jsonb_build_object('task', jsonb_build_object(
    'complete', false, 'failed', false, 'active', NOT active, 'timestamp', 100
  )))
)->'taskCompletions'->'task'->'active', to_jsonb(NOT active),
  'explicit incoming acceptance wins over an equal-time terminal row flag') FROM terminal_active_fixture;
SELECT * FROM finish();
ROLLBACK;
