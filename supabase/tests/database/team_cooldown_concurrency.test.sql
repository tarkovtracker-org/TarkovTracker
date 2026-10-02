BEGIN;
SELECT plan(9);
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
-- Disposable local Supabase credentials. TCP uses SCRAM, which non-superuser dblink requires.
SELECT extensions.dblink_connect('cooldown_winner', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
SELECT extensions.dblink_connect('cooldown_waiter', format(
  'host=%s dbname=%s user=postgres password=postgres', inet_server_addr(), current_database()));
CREATE TEMP TABLE cooldown_race_fixture AS
SELECT gen_random_uuid() AS owner_id, gen_random_uuid() AS member_id,
  gen_random_uuid() AS other_id, gen_random_uuid() AS team_id;
SELECT extensions.dblink_exec('cooldown_winner', format(
  'INSERT INTO auth.users(id,email) VALUES (%L,%L),(%L,%L),(%L,%L); '
  'INSERT INTO public.teams(id,name,join_code,owner_id,game_mode) VALUES (%L,%L,%L,%L,''pvp''); '
  'INSERT INTO public.team_memberships(team_id,user_id,role,game_mode) VALUES '
  '(%L,%L,''owner'',''pvp''),(%L,%L,''member'',''pvp''),(%L,%L,''member'',''pvp''); '
  'INSERT INTO private.team_action_cooldowns VALUES (%L,''pve'',''leave'',clock_timestamp()-interval ''10 minutes'')',
  owner_id,owner_id||'@example.invalid',member_id,member_id||'@example.invalid',other_id,other_id||'@example.invalid',
  team_id,'cooldown-'||team_id,team_id,owner_id,team_id,owner_id,team_id,member_id,team_id,other_id,owner_id)) FROM cooldown_race_fixture;
CREATE TEMP TABLE cooldown_race_pids AS
SELECT w.pid AS winner, c.pid AS waiter
FROM extensions.dblink('cooldown_winner','SELECT pg_backend_pid()') AS w(pid int),
  extensions.dblink('cooldown_waiter','SELECT pg_backend_pid()') AS c(pid int);
CREATE FUNCTION pg_temp.await_cooldown_wait() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  FOR attempt IN 1..200 LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM cooldown_race_pids WHERE winner = ANY(pg_blocking_pids(waiter)));
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT extensions.dblink_exec('cooldown_winner','BEGIN; SET LOCAL statement_timeout = ''10s''');
-- Hold an expired row so the waiter captures its clock before the winning claim advances it.
SELECT extensions.dblink_exec('cooldown_winner',format(
  'UPDATE private.team_action_cooldowns SET last_at=last_at WHERE user_id=%L',owner_id)) FROM cooldown_race_fixture;
SELECT extensions.dblink_send_query('cooldown_waiter',format(
  'SELECT private.claim_team_action_cooldown(%L,''pve'',''leave'')',owner_id)) FROM cooldown_race_fixture;
SELECT pg_temp.await_cooldown_wait();
SELECT ok(winner = ANY(pg_blocking_pids(waiter)),'conditional upsert waits on the locked cooldown row') FROM cooldown_race_pids;
SELECT ok(result,'the lock holder advances the expired cooldown after the waiter started')
FROM cooldown_race_fixture, LATERAL extensions.dblink('cooldown_winner',format(
  'SELECT private.claim_team_action_cooldown(%L,''pve'',''leave'')',owner_id)) AS claimed(result boolean);
SELECT extensions.dblink_exec('cooldown_winner','COMMIT');
SELECT ok(NOT result,'the waiting claim cannot mistake the winning timestamp for future history')
FROM extensions.dblink_get_result('cooldown_waiter') AS rejected(result boolean);
SELECT * FROM extensions.dblink_get_result('cooldown_waiter') AS drained(result boolean);

-- Real RPCs retain their per-actor lock order and recheck state after the first commit.
SELECT extensions.dblink_exec('cooldown_winner','BEGIN; SET LOCAL statement_timeout = ''10s''');
SELECT is(result,'kicked','first kick removes only its target before commit')
FROM cooldown_race_fixture, LATERAL extensions.dblink('cooldown_winner',format(
  'SELECT public.kick_team(%L,%L,%L)',team_id,owner_id,member_id)) AS kicked(result text);
SELECT extensions.dblink_send_query('cooldown_waiter',format(
  'SELECT public.kick_team(%L,%L,%L)',team_id,owner_id,other_id)) FROM cooldown_race_fixture;
SELECT pg_temp.await_cooldown_wait();
SELECT ok(winner = ANY(pg_blocking_pids(waiter)),'second kick waits on the initiating owner lock') FROM cooldown_race_pids;
SELECT extensions.dblink_exec('cooldown_winner','COMMIT');
SELECT is(result,'cooldown','waiting kick is rejected without deleting the second target')
FROM extensions.dblink_get_result('cooldown_waiter') AS rejected(result text);
SELECT * FROM extensions.dblink_get_result('cooldown_waiter') AS drained(result text);

SELECT extensions.dblink_exec('cooldown_winner','BEGIN; SET LOCAL statement_timeout = ''10s''');
SELECT is(result,'left','first leave removes the remaining member before commit')
FROM cooldown_race_fixture, LATERAL extensions.dblink('cooldown_winner',format(
  'SELECT public.leave_team(%L,%L)',team_id,other_id)) AS left_team(result text);
SELECT extensions.dblink_send_query('cooldown_waiter',format(
  'SELECT public.leave_team(%L,%L)',team_id,other_id)) FROM cooldown_race_fixture;
SELECT pg_temp.await_cooldown_wait();
SELECT ok(winner = ANY(pg_blocking_pids(waiter)),'duplicate leave waits on the member lock') FROM cooldown_race_pids;
SELECT extensions.dblink_exec('cooldown_winner','COMMIT');
SELECT is(result,'not_member','waiting leave observes the committed removal instead of duplicating it')
FROM extensions.dblink_get_result('cooldown_waiter') AS rejected(result text);
SELECT * FROM extensions.dblink_get_result('cooldown_waiter') AS drained(result text);
SELECT extensions.dblink_exec('cooldown_winner',format(
  'SELECT public.disband_team(%L,%L); DELETE FROM auth.users WHERE id IN (%L,%L,%L)',
  team_id,owner_id,owner_id,member_id,other_id)) FROM cooldown_race_fixture;
SELECT extensions.dblink_disconnect('cooldown_winner');
SELECT extensions.dblink_disconnect('cooldown_waiter');
SELECT * FROM finish();
ROLLBACK;
