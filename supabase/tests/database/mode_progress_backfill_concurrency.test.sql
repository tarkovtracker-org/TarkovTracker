BEGIN;
SELECT plan(7);
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
-- Disposable local Supabase credentials; both sessions run against the replayed local database.
SELECT extensions.dblink_connect('backfill_writer', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
SELECT extensions.dblink_connect('backfill_reader', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
CREATE TEMP TABLE backfill_race_fixture AS SELECT gen_random_uuid() AS user_id;
SELECT extensions.dblink_exec('backfill_writer', format(
  'BEGIN; '
  'INSERT INTO auth.users(id,email) VALUES (%L,%L); '
  'UPDATE public.user_progress SET pvp_data=''{"level":20}''::jsonb WHERE user_id=%L; '
  'DELETE FROM public.user_game_mode_progress WHERE user_id=%L; '
  'INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data) '
  'VALUES (%L,''pvp'',0,''{}''); '
  'COMMIT',
  user_id,user_id||'@example.invalid',user_id,user_id,user_id)) FROM backfill_race_fixture;
CREATE TEMP TABLE backfill_race_pids AS
SELECT w.pid AS writer,r.pid AS reader
FROM extensions.dblink('backfill_writer','SELECT pg_backend_pid()') AS w(pid int),
  extensions.dblink('backfill_reader','SELECT pg_backend_pid()') AS r(pid int);
CREATE FUNCTION pg_temp.await_backfill_wait() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  FOR attempt IN 1..100 LOOP
    EXIT WHEN EXISTS(SELECT 1 FROM backfill_race_pids WHERE writer=ANY(pg_blocking_pids(reader)));
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
-- The backfill sees a placeholder, waits for a live save, then rechecks the level after commit.
SELECT extensions.dblink_exec('backfill_writer','BEGIN');
SELECT extensions.dblink_exec('backfill_writer',format(
  'UPDATE public.user_game_mode_progress SET progress_data=''{"level":42}'' WHERE user_id=%L',user_id))
FROM backfill_race_fixture;
SELECT extensions.dblink_send_query('backfill_reader',format(
  'SELECT private.backfill_game_mode_progress_range(%L,NULL)',user_id)) FROM backfill_race_fixture;
SELECT pg_temp.await_backfill_wait();
SELECT ok(writer=ANY(pg_blocking_pids(reader)),'backfill waits on the in-flight placeholder save') FROM backfill_race_pids;
SELECT extensions.dblink_exec('backfill_writer','COMMIT');
SELECT is(result,0::bigint,'a concurrent real save wins the backfill update')
FROM extensions.dblink_get_result('backfill_reader') AS result(result bigint);
SELECT * FROM extensions.dblink_get_result('backfill_reader') AS drained(result bigint);
SELECT is((SELECT progress_data->'level' FROM public.user_game_mode_progress WHERE user_id=f.user_id),
 '42'::jsonb,'backfill preserves the live save') FROM backfill_race_fixture f;
-- Already materialized rows must not be locked or re-sanitized even when a writer holds them.
SELECT extensions.dblink_exec('backfill_writer','BEGIN');
SELECT extensions.dblink_exec('backfill_writer',format(
  'UPDATE public.user_game_mode_progress SET updated_at=updated_at WHERE user_id=%L',user_id)) FROM backfill_race_fixture;
SELECT is(result,0::bigint,'materialized rows are skipped without waiting for their writer')
FROM backfill_race_fixture,LATERAL extensions.dblink('backfill_reader',format(
  'SELECT private.backfill_game_mode_progress_range(%L,NULL)',user_id)) AS result(result bigint);
SELECT extensions.dblink_exec('backfill_writer','ROLLBACK');
-- A real row-lock timeout leaves the placeholder and the caller flag unchanged; retry succeeds.
SELECT extensions.dblink_exec('backfill_writer',format(
  'DELETE FROM public.user_game_mode_progress WHERE user_id=%L; '
  'INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data) '
  'VALUES (%L,''pvp'',0,''{}'')',user_id,user_id)) FROM backfill_race_fixture;
SELECT extensions.dblink_exec('backfill_writer','BEGIN');
SELECT extensions.dblink_exec('backfill_writer',format(
  'UPDATE public.user_game_mode_progress SET updated_at=updated_at WHERE user_id=%L',user_id)) FROM backfill_race_fixture;
SELECT throws_ok(format('SELECT result FROM extensions.dblink(''backfill_reader'',%L) AS result(result bigint)',
 format('SELECT private.backfill_game_mode_progress_range(%L,NULL)',user_id)),
 '55P03',NULL,'a real row-lock timeout aborts the backfill') FROM backfill_race_fixture;
SELECT ok(NOT result,'a failed backfill restores the session flag')
FROM extensions.dblink('backfill_reader','SELECT private.mode_progress_backfill_active()') AS flag(result boolean);
SELECT extensions.dblink_exec('backfill_writer','ROLLBACK');
SELECT is(result,1::bigint,'retry repairs the placeholder after the writer releases its lock')
FROM backfill_race_fixture,LATERAL extensions.dblink('backfill_reader',format(
 'SELECT private.backfill_game_mode_progress_range(%L,NULL)',user_id)) AS result(result bigint);
SELECT extensions.dblink_exec('backfill_writer',format('DELETE FROM auth.users WHERE id=%L',user_id)) FROM backfill_race_fixture;
SELECT extensions.dblink_disconnect('backfill_writer');
SELECT extensions.dblink_disconnect('backfill_reader');
SELECT * FROM finish();
ROLLBACK;
