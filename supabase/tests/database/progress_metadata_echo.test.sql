BEGIN;
SELECT plan(12);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000963', 'echo-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000964', 'echo-conflict@example.invalid');
CREATE TEMP TABLE metadata_echo_events (uid bigint, write_id text);
CREATE FUNCTION pg_temp.capture_metadata_echo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pg_temp.metadata_echo_events VALUES (NEW.tarkov_uid, NEW.metadata_write_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_metadata_echo AFTER INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.capture_metadata_echo();
CREATE TEMP TABLE metadata_echo_outcomes (label text, data jsonb);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, 7, '{"pvp":{"level":10}}', NULL);
TRUNCATE metadata_echo_events;
INSERT INTO metadata_echo_outcomes VALUES
  ('accepted', public.sync_user_game_mode_progress('pvp', 2, 1001, '{"pvp":{"level":12}}', NULL));
SELECT ok((SELECT data->>'metadata_write_id' IS NOT NULL FROM metadata_echo_outcomes WHERE label='accepted'),
  'an accepted link returns server-authored metadata transaction evidence');
SELECT is((SELECT count(*)::int FROM metadata_echo_events), 2,
  'relinking emits the intermediate metadata tuple and the final UID tuple');
SELECT is((SELECT count(DISTINCT write_id)::int FROM metadata_echo_events), 1,
  'both tuples carry the same top-level transaction marker');
SELECT is((SELECT data->>'metadata_write_id' FROM metadata_echo_outcomes WHERE label='accepted'),
  (SELECT min(write_id) FROM metadata_echo_events), 'the RPC marker matches its Realtime tuples');
SELECT is((SELECT data->>'metadata_write_id' FROM metadata_echo_outcomes WHERE label='accepted'),
  pg_current_xact_id()::text, 'the marker identifies the actual server transaction');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$UPDATE public.user_progress SET metadata_write_id = 'forged'
  WHERE user_id = '00000000-0000-0000-0000-000000000963'$$,
  '42501', 'permission denied for table user_progress',
  'clients cannot forge markers through a direct table write');
SELECT lives_ok($$SELECT public.sync_user_game_mode_progress(
  'pvp', 2, 1001, '{"pvp":{"level":12}}', NULL)$$,
  'authenticated clients can use the existing progress RPC');
RESET ROLE;
UPDATE public.user_progress SET metadata_write_id = 'forged'
  WHERE user_id = '00000000-0000-0000-0000-000000000963';
SELECT is((SELECT metadata_write_id FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000000963'), pg_current_xact_id()::text,
  'the trigger overwrites a caller-supplied marker');
SELECT ok(NOT has_function_privilege('authenticated',
  'private.set_progress_metadata_write_id()', 'EXECUTE'),
  'clients receive no new function execution privilege');
SELECT is((SELECT data - 'metadata_write_id' FROM metadata_echo_outcomes WHERE label='accepted'),
  '{"tarkov_uid":1001,"tarkov_uid_conflict":false}'::jsonb,
  'older clients can read the existing response fields unchanged');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000964', true);
INSERT INTO metadata_echo_outcomes VALUES
  ('rejected', public.sync_user_game_mode_progress('pvp', 1, 1001, '{"pvp":{"level":15}}', NULL));
SELECT is((SELECT data->'tarkov_uid_conflict' FROM metadata_echo_outcomes WHERE label='rejected'),
  'true'::jsonb, 'retained UID conflicts still return truthfully');
SELECT is((SELECT data->>'metadata_write_id' FROM metadata_echo_outcomes WHERE label='rejected'),
  (SELECT metadata_write_id FROM public.user_progress WHERE user_id = '00000000-0000-0000-0000-000000000964'),
  'a rejected link returns the marker of the metadata it retained');
SELECT * FROM finish();
ROLLBACK;
