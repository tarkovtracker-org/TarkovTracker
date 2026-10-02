BEGIN;
SELECT plan(52);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000951','kick-owner@example.invalid'),
 ('00000000-0000-0000-0000-000000000952','kick-member@example.invalid'),
 ('00000000-0000-0000-0000-000000000953','kick-other@example.invalid');
CREATE TEMP TABLE kick_teams AS SELECT mode,
 ('00000000-0000-0000-0000-00000000096'||n)::uuid team_id
 FROM (VALUES(1,'pvp'),(2,'pve'),(3,'seasonal')) x(n,mode);
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode)
SELECT team_id,'kick-'||mode,'kick-'||mode,'00000000-0000-0000-0000-000000000951'::uuid,mode FROM kick_teams;
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT team_id,'00000000-0000-0000-0000-000000000951'::uuid,'owner',mode FROM kick_teams
UNION ALL SELECT team_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_teams;

-- Membership deletion, cooldown evidence, and the trusted event commit together.
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' kick succeeds') FROM kick_teams;
SELECT is((SELECT count(*)::integer FROM public.team_events
 WHERE event_type='member_kicked' AND target_user='00000000-0000-0000-0000-000000000952'
   AND initiated_by='00000000-0000-0000-0000-000000000951'),3,'one trusted event per kick');

-- The verified current events from the successful kicks are cooldown evidence; a re-add
-- plus immediate re-kick is blocked before any row changes.
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT team_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_teams;
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'cooldown',mode||' cooldown blocks immediate re-kick') FROM kick_teams;

-- Transitional: verified events written by the previous RPC bodies still block.
UPDATE private.team_action_cooldowns SET last_at=now()-interval '10 minutes' WHERE user_id='00000000-0000-0000-0000-000000000951';
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'cooldown',mode||' legacy events still block') FROM kick_teams;

-- Event failure after the DELETE must roll the whole kick back (the #864 regression).
-- Expire the earlier cooldown first so the kick reaches the event INSERT,
-- then fail every event insert. The authority trigger is AFTER, so the failing trigger
-- must also be AFTER to abort the statement whose failure rolls the kick back.
UPDATE public.team_events SET server_verified=FALSE WHERE initiated_by='00000000-0000-0000-0000-000000000951';
UPDATE private.team_action_cooldowns SET last_at=now()-interval '10 minutes'
 WHERE user_id='00000000-0000-0000-0000-000000000951';
CREATE FUNCTION pg_temp.fail_kick_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test event failure'; END; $$;
CREATE TRIGGER test_fail_kick_event AFTER INSERT ON public.team_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_kick_event();
SELECT throws_ok(format('SELECT public.kick_team(%L::uuid,%L::uuid,%L::uuid)',
  team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'P0001','test event failure',mode||' event failure rolls back kick') FROM kick_teams;
SELECT is(count(*)::integer,3,'event failure retains every membership')
 FROM public.team_memberships WHERE user_id='00000000-0000-0000-0000-000000000952';
SELECT is(count(*)::integer,3,'event failure does not advance cooldowns') FROM private.team_action_cooldowns
 WHERE user_id='00000000-0000-0000-0000-000000000951' AND last_at=now()-interval '10 minutes';
DROP TRIGGER test_fail_kick_event ON public.team_events;

-- An expired cooldown permits the kick, which deletes the member.
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' expired cooldown permits kick') FROM kick_teams;

-- Future timestamps are not cooldown evidence; re-add the member first.
UPDATE public.team_events SET server_verified=FALSE WHERE initiated_by='00000000-0000-0000-0000-000000000951';
UPDATE private.team_action_cooldowns SET last_at=now()+interval '1 year'
 WHERE user_id='00000000-0000-0000-0000-000000000951';
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT team_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_teams
ON CONFLICT DO NOTHING;
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' ignores future cooldown history') FROM kick_teams;

-- Expire the fresh cooldown for the remaining classification checks.
UPDATE public.team_events SET server_verified=FALSE WHERE initiated_by='00000000-0000-0000-0000-000000000951';
UPDATE private.team_action_cooldowns SET last_at=now()-interval '10 minutes'
 WHERE user_id='00000000-0000-0000-0000-000000000951';
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000951'),
 'self',mode||' cannot kick self') FROM kick_teams;
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000952','00000000-0000-0000-0000-000000000951'),
 'not_owner',mode||' non-owner initiator rejected') FROM kick_teams;
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000953'),
 'not_member',mode||' unknown member rejected') FROM kick_teams;
SELECT is(public.kick_team('00000000-0000-0000-0000-000000000971'::uuid,
 '00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'not_found','unknown team rejected');
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000961','00000000-0000-0000-0000-000000000952'),
 'not_owner',mode||' initiator without membership rejected as not_owner') FROM kick_teams;
SELECT is(count(*)::integer,3,'rejected kicks do not advance cooldowns') FROM private.team_action_cooldowns
 WHERE user_id='00000000-0000-0000-0000-000000000951' AND last_at=now()-interval '10 minutes';

-- Disbanding the team cascades its events but must not erase the durable cooldown (#646):
-- an owner cannot disband, recreate, and kick again within the window.
CREATE TEMP TABLE kick_rebuilt AS SELECT mode,
 ('00000000-0000-0000-0000-00000000098'||n)::uuid first_id,
 ('00000000-0000-0000-0000-00000000099'||n)::uuid second_id
 FROM (VALUES(1,'pvp'),(2,'pve'),(3,'seasonal')) x(n,mode);
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode)
SELECT first_id,'kick-first-'||mode,'kick-first-'||mode,'00000000-0000-0000-0000-000000000951'::uuid,mode FROM kick_rebuilt
UNION ALL SELECT second_id,'kick-second-'||mode,'kick-second-'||mode,'00000000-0000-0000-0000-000000000951'::uuid,mode FROM kick_rebuilt;
DELETE FROM public.team_memberships WHERE team_id IN (SELECT team_id FROM kick_teams);
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT first_id,'00000000-0000-0000-0000-000000000951'::uuid,'owner',mode FROM kick_rebuilt
UNION ALL SELECT first_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_rebuilt;
SELECT is(public.kick_team(first_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' kick before disband succeeds') FROM kick_rebuilt;
-- Model kicks committed by the previous RPC bodies: no durable rows exist yet.
DELETE FROM private.team_action_cooldowns WHERE user_id='00000000-0000-0000-0000-000000000951';
SELECT ok(public.disband_team(first_id,'00000000-0000-0000-0000-000000000951'),mode||' owner disbands') FROM kick_rebuilt;
SELECT is(count(*)::integer,3,'disband preserves legacy-only kick cooldowns') FROM private.team_action_cooldowns
 WHERE user_id='00000000-0000-0000-0000-000000000951' AND action='kick';
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT second_id,'00000000-0000-0000-0000-000000000951'::uuid,'owner',mode FROM kick_rebuilt
UNION ALL SELECT second_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_rebuilt;
SELECT is(public.kick_team(second_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'cooldown',mode||' cooldown survives disband') FROM kick_rebuilt;

-- A cooldown in one mode never blocks another mode.
UPDATE private.team_action_cooldowns SET last_at=now()-interval '10 minutes'
 WHERE user_id='00000000-0000-0000-0000-000000000951' AND game_mode<>'pvp';
SELECT is(public.kick_team(second_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 CASE mode WHEN 'pvp' THEN 'cooldown' ELSE 'kicked' END,mode||' cooldown is mode isolated') FROM kick_rebuilt;

-- Account cleanup removes a deleted target's events, but must preserve the owner's legacy kick.
-- PvP was blocked in the mode-isolation probe; give it equivalent legacy-only history.
INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by)
SELECT second_id,'member_kicked','00000000-0000-0000-0000-000000000952',
 '00000000-0000-0000-0000-000000000951' FROM kick_rebuilt WHERE mode='pvp';
DELETE FROM private.team_action_cooldowns WHERE user_id='00000000-0000-0000-0000-000000000951';
DELETE FROM public.team_events WHERE target_user='00000000-0000-0000-0000-000000000952';
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT second_id,'00000000-0000-0000-0000-000000000953'::uuid,'member',mode FROM kick_rebuilt;
SELECT is(public.kick_team(second_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000953'),
 'cooldown',mode||' target event cleanup preserves legacy kick cooldown') FROM kick_rebuilt;

-- Ordinary clients cannot execute the service-role-only RPC.
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.kick_team(
 '00000000-0000-0000-0000-000000000961'::uuid,
 '00000000-0000-0000-0000-000000000951'::uuid,
 '00000000-0000-0000-0000-000000000952'::uuid)$$,
 '42501',NULL,'ordinary clients cannot execute the kick RPC');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
