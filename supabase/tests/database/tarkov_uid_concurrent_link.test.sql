BEGIN;
SELECT plan(6);
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

-- Local Supabase test credentials only. Connect through the server's TCP address so dblink
-- authenticates with SCRAM (loopback uses trust, which non-superuser dblink rejects).
SELECT extensions.dblink_connect('uid_winner', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
SELECT extensions.dblink_connect('uid_claimant', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
CREATE TEMP TABLE uid_race_fixture AS
SELECT gen_random_uuid() AS winner, gen_random_uuid() AS claimant, 987654321001::bigint AS uid;
-- Separate sessions need committed users. Random UUIDs isolate these disposable local fixtures.
SELECT extensions.dblink_exec('uid_winner', format(
  'INSERT INTO auth.users (id, email) VALUES (%L, %L), (%L, %L)',
  winner, winner || '@example.invalid', claimant, claimant || '@example.invalid'))
FROM uid_race_fixture;
SELECT extensions.dblink_exec('uid_winner', 'BEGIN; SET LOCAL statement_timeout = ''10s''');
SELECT extensions.dblink_exec('uid_claimant', 'BEGIN; SET LOCAL statement_timeout = ''10s''');
SELECT extensions.dblink_exec('uid_winner', format(
  'SET LOCAL request.jwt.claim.sub = %L', winner)) FROM uid_race_fixture;
SELECT extensions.dblink_exec('uid_claimant', format(
  'SET LOCAL request.jwt.claim.sub = %L', claimant)) FROM uid_race_fixture;
CREATE TEMP TABLE uid_race_pids AS
SELECT w.pid AS winner, c.pid AS claimant
FROM extensions.dblink('uid_winner', 'SELECT pg_backend_pid()') AS w(pid int),
  extensions.dblink('uid_claimant', 'SELECT pg_backend_pid()') AS c(pid int);
SELECT is(result - 'metadata_write_id', jsonb_build_object('tarkov_uid', uid, 'tarkov_uid_conflict', false),
  'the first concurrent claimant links the UID before committing')
FROM uid_race_fixture, LATERAL extensions.dblink('uid_winner', format(
  'SELECT public.sync_user_game_mode_progress(''pvp'', 2, %s, ''{"pvp":{"level":10}}'', NULL)', uid
)) AS linked(result jsonb);
SELECT extensions.dblink_send_query('uid_claimant', format(
  'SELECT public.sync_user_game_mode_progress(''pve'', 3, %s, ''{"pve":{"level":15}}'', NULL)', uid
)) FROM uid_race_fixture;
-- Observe the actual uniqueness wait, rather than assuming that dispatch creates overlap.
DO $$
BEGIN
  FOR attempt IN 1..200 LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM uid_race_pids WHERE winner = ANY(pg_blocking_pids(claimant)));
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT ok(winner = ANY(pg_blocking_pids(claimant)),
  'the second session waits on the uncommitted winning UID claim') FROM uid_race_pids;
SELECT extensions.dblink_exec('uid_winner', 'COMMIT');
SELECT is(result - 'metadata_write_id', '{"tarkov_uid":null,"tarkov_uid_conflict":true}'::jsonb,
  'the waiting claimant reports a conflict after the winning claim commits')
FROM extensions.dblink_get_result('uid_claimant') AS rejected(result jsonb);
-- Drain the async result before issuing another command on this connection.
SELECT * FROM extensions.dblink_get_result('uid_claimant') AS drained(result jsonb);
SELECT extensions.dblink_exec('uid_claimant', 'COMMIT');
SELECT is((SELECT count(*) FROM public.user_progress p, uid_race_fixture f
  WHERE p.user_id IN (f.winner, f.claimant) AND p.tarkov_uid = f.uid), 1::bigint,
  'exactly one account owns the UID after both transactions commit');
SELECT is((SELECT (p.progress_data->>'level')::int
  FROM public.user_game_mode_progress p, uid_race_fixture f
  WHERE p.user_id = f.winner AND p.game_mode = 'pvp'), 10,
  'the winning transaction preserves its progress');
SELECT is((SELECT (p.progress_data->>'level')::int
  FROM public.user_game_mode_progress p, uid_race_fixture f
  WHERE p.user_id = f.claimant AND p.game_mode = 'pve'), 15,
  'the losing uniqueness claim still commits unrelated progress');
-- Remove the committed fixtures explicitly; the surrounding rollback removes dblink and temp data.
SELECT extensions.dblink_exec('uid_winner', format(
  'DELETE FROM public.mutation_rate_limits WHERE scope = ''progress-sync'' AND subject IN (%L, %L); '
  'DELETE FROM auth.users WHERE id IN (%L, %L)', winner, claimant, winner, claimant))
FROM uid_race_fixture;
SELECT extensions.dblink_disconnect('uid_winner');
SELECT extensions.dblink_disconnect('uid_claimant');
SELECT * FROM finish();
ROLLBACK;
