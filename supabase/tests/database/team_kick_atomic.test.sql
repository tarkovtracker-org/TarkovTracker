BEGIN;
SELECT plan(31);
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

-- Event failure after the DELETE must roll the whole kick back (the #864 regression).
-- Invalidate the earlier cooldown evidence first so the kick reaches the event INSERT,
-- then fail every event insert. The authority trigger is AFTER, so the failing trigger
-- must also be AFTER to abort the statement whose failure rolls the kick back.
UPDATE public.team_events SET server_verified=FALSE WHERE event_type='member_kicked';
CREATE FUNCTION pg_temp.fail_kick_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test event failure'; END; $$;
CREATE TRIGGER test_fail_kick_event AFTER INSERT ON public.team_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_kick_event();
SELECT throws_ok(format('SELECT public.kick_team(%L::uuid,%L::uuid,%L::uuid)',
  team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'P0001','test event failure',mode||' event failure rolls back kick') FROM kick_teams;
SELECT is(count(*)::integer,3,'event failure retains every membership')
 FROM public.team_memberships WHERE user_id='00000000-0000-0000-0000-000000000952';
DROP TRIGGER test_fail_kick_event ON public.team_events;

-- Unverified history is not cooldown evidence: the kick proceeds and deletes the member.
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' ignores unverified cooldown history') FROM kick_teams;

-- Future timestamps are likewise not cooldown evidence; re-add the member first.
UPDATE public.team_events SET server_verified=TRUE,created_at=now()+interval '1 year'
 WHERE event_type='member_kicked';
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT team_id,'00000000-0000-0000-0000-000000000952'::uuid,'member',mode FROM kick_teams
ON CONFLICT DO NOTHING;
SELECT is(public.kick_team(team_id,'00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952'),
 'kicked',mode||' ignores future cooldown history') FROM kick_teams;

-- Neutralize the fresh cooldown evidence for the remaining classification checks.
UPDATE public.team_events SET server_verified=FALSE WHERE event_type='member_kicked';
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
