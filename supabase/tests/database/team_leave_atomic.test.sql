BEGIN;
SELECT no_plan();
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000921','leave-owner@example.invalid'),
 ('00000000-0000-0000-0000-000000000922','leave-member@example.invalid');
CREATE TEMP TABLE leave_teams AS SELECT mode,
 ('00000000-0000-0000-0000-00000000093'||n)::uuid old_id,
 ('00000000-0000-0000-0000-00000000094'||n)::uuid new_id
 FROM (VALUES(1,'pvp'),(2,'pve'),(3,'seasonal')) x(n,mode);
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode)
SELECT old_id,'leave-old-'||mode,'leave-old-'||mode,'00000000-0000-0000-0000-000000000921'::uuid,mode FROM leave_teams
UNION ALL SELECT new_id,'leave-new-'||mode,'leave-new-'||mode,'00000000-0000-0000-0000-000000000921'::uuid,mode FROM leave_teams;
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT old_id,'00000000-0000-0000-0000-000000000922','member',mode FROM leave_teams;
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT old_id,'00000000-0000-0000-0000-000000000921','owner',mode FROM leave_teams;
SELECT is(public.leave_team(old_id,'00000000-0000-0000-0000-000000000921'),'owner',mode||' owner must disband') FROM leave_teams;
SELECT is(public.leave_team(old_id,'00000000-0000-0000-0000-000000000922'),'left',mode||' leave succeeds') FROM leave_teams;
-- Deterministic interleaving: leave commits its logical operation, then the new join occurs
-- before the old Edge request returns. There must be no later unconditional pointer write.
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT new_id,'00000000-0000-0000-0000-000000000922','member',mode FROM leave_teams;
SELECT is((SELECT count(*)::integer FROM public.user_system WHERE user_id='00000000-0000-0000-0000-000000000922'),1,'pointer owner row survives leave and new join');
SELECT is(CASE mode WHEN 'pvp' THEN s.pvp_team_id WHEN 'pve' THEN s.pve_team_id ELSE s.seasonal_team_id END,
 new_id,mode||' newer join pointer survives') FROM leave_teams CROSS JOIN public.user_system s
WHERE s.user_id='00000000-0000-0000-0000-000000000922';
SELECT is(public.leave_team(new_id,'00000000-0000-0000-0000-000000000922'),'cooldown',mode||' cooldown crosses teams') FROM leave_teams;
-- Historical provenance and future timestamps are not accepted as current cooldown evidence.
UPDATE public.team_events SET server_verified=FALSE WHERE initiated_by='00000000-0000-0000-0000-000000000922';
UPDATE public.team_events SET server_verified=TRUE,created_at=now()+interval '1 year'
WHERE team_id=(SELECT old_id FROM leave_teams WHERE mode='pve');
CREATE FUNCTION pg_temp.fail_leave_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test event failure'; END; $$;
CREATE TRIGGER test_fail_leave_event BEFORE INSERT ON public.team_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_leave_event();
SELECT throws_ok(format('SELECT public.leave_team(%L::uuid,%L::uuid)',new_id,'00000000-0000-0000-0000-000000000922'),
 'P0001','test event failure',mode||' event failure rolls back leave') FROM leave_teams;
SELECT is(count(*)::integer,3,'event failure retains every membership') FROM public.team_memberships
WHERE user_id='00000000-0000-0000-0000-000000000922';
DROP TRIGGER test_fail_leave_event ON public.team_events;
SELECT is(public.leave_team(new_id,'00000000-0000-0000-0000-000000000922'),'left',mode||' ignores unverified/future history') FROM leave_teams;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.leave_team('00000000-0000-0000-0000-000000000931','00000000-0000-0000-0000-000000000922')$$,
 '42501',NULL,'ordinary clients cannot supply victim IDs through RPC');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
