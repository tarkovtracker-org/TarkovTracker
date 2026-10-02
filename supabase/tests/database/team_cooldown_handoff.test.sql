BEGIN;
SELECT plan(21);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000001041','handoff-owner@example.invalid'),
 ('00000000-0000-0000-0000-000000001042','handoff-member@example.invalid');
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode) VALUES
 ('00000000-0000-0000-0000-000000001043','handoff-old','handoff-old','00000000-0000-0000-0000-000000001041','pvp');
INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by) VALUES
 ('00000000-0000-0000-0000-000000001043','member_left','00000000-0000-0000-0000-000000001042','00000000-0000-0000-0000-000000001042'),
 ('00000000-0000-0000-0000-000000001043','member_kicked','00000000-0000-0000-0000-000000001042','00000000-0000-0000-0000-000000001041');
CREATE TEMP TABLE handoff_times AS SELECT initiated_by,created_at FROM public.team_events
WHERE team_id='00000000-0000-0000-0000-000000001043';
SELECT ok(NOT private.claim_team_action_cooldown('00000000-0000-0000-0000-000000001042','pvp','leave'),
 'legacy-only leave prevents the first durable claim');
SELECT is((SELECT count(*)::int FROM private.team_action_cooldowns),0,
 'rejecting legacy-only history does not spend a cooldown');
-- Disband failure must also roll back preservation (events and team remain intact).
CREATE FUNCTION pg_temp.fail_handoff_disband() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'handoff disband failure'; END;
$$;
CREATE TRIGGER zz_fail_handoff_disband AFTER DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_handoff_disband();
SELECT throws_ok($$SELECT public.disband_team('00000000-0000-0000-0000-000000001043',
 '00000000-0000-0000-0000-000000001041')$$,'P0001','handoff disband failure','failed disband rolls back preservation');
SELECT is((SELECT count(*)::int FROM private.team_action_cooldowns),0,'failed disband leaves no durable rows');
DROP TRIGGER zz_fail_handoff_disband ON public.teams;
SELECT ok(public.disband_team('00000000-0000-0000-0000-000000001043','00000000-0000-0000-0000-000000001041'),
 'successful disband preserves legacy cooldowns');
SELECT is((SELECT count(*)::int FROM private.team_action_cooldowns c JOIN handoff_times h
 ON h.initiated_by=c.user_id AND c.last_at=h.created_at),2,'preservation retains exact event timestamps');
SELECT ok(private.claim_team_action_cooldown('00000000-0000-0000-0000-000000001041','pvp','leave'),
 'owner kick cooldown does not block the leave action');
-- Invalid provenance, future time, wrong leave target and deleted initiators must not become trusted.
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode) VALUES
 ('00000000-0000-0000-0000-000000001044','handoff-invalid','handoff-invalid','00000000-0000-0000-0000-000000001041','pve');
INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by,event_data) VALUES
 ('00000000-0000-0000-0000-000000001044','member_left','00000000-0000-0000-0000-000000001042','00000000-0000-0000-0000-000000001042','{"fixture":"unverified"}'),
 ('00000000-0000-0000-0000-000000001044','member_kicked','00000000-0000-0000-0000-000000001042','00000000-0000-0000-0000-000000001041','{"fixture":"future"}'),
 ('00000000-0000-0000-0000-000000001044','member_left','00000000-0000-0000-0000-000000001042','00000000-0000-0000-0000-000000001041','{"fixture":"wrong_target"}'),
 ('00000000-0000-0000-0000-000000001044','member_kicked','00000000-0000-0000-0000-000000001042',NULL,'{"fixture":"deleted_initiator"}');
UPDATE public.team_events SET server_verified=false WHERE event_data->>'fixture'='unverified';
UPDATE public.team_events SET created_at=clock_timestamp()+interval '1 year' WHERE event_data->>'fixture'='future';
SELECT ok(private.claim_team_action_cooldown('00000000-0000-0000-0000-000000001042','pve','leave'),
 'legacy reader ignores unverified events');
SELECT ok(private.claim_team_action_cooldown('00000000-0000-0000-0000-000000001041','pve','kick'),
 'legacy reader ignores future and NULL initiator events');
SELECT ok(private.claim_team_action_cooldown('00000000-0000-0000-0000-000000001041','pve','leave'),
 'legacy reader ignores another target in a leave event');
DELETE FROM private.team_action_cooldowns WHERE game_mode='pve';
SELECT ok(public.disband_team('00000000-0000-0000-0000-000000001044','00000000-0000-0000-0000-000000001041'),
 'invalid legacy history does not abort disband');
SELECT is((SELECT count(*)::int FROM private.team_action_cooldowns WHERE game_mode='pve'),0,
 'deletion preservation ignores all invalid legacy history');
SELECT ok(NOT pg_catalog.has_function_privilege('anon','public.leave_team(uuid,uuid)','EXECUTE'),
 'anonymous callers cannot execute leave');
SELECT ok(NOT pg_catalog.has_function_privilege('anon','public.kick_team(uuid,uuid,uuid)','EXECUTE'),
 'anonymous callers cannot execute kick');
SELECT ok(pg_catalog.has_function_privilege('service_role','public.leave_team(uuid,uuid)','EXECUTE'),
 'service role keeps leave execution');
SELECT ok(pg_catalog.has_function_privilege('service_role','public.kick_team(uuid,uuid,uuid)','EXECUTE'),
 'service role keeps kick execution');
SELECT ok(NOT pg_catalog.has_function_privilege('authenticated','private.claim_team_action_cooldown(uuid,text,text)','EXECUTE'),
 'authenticated callers cannot spend private cooldowns');
SELECT ok(NOT pg_catalog.has_function_privilege('authenticated','private.preserve_team_action_cooldowns()','EXECUTE'),
 'authenticated callers cannot execute the definer preservation trigger');
SELECT ok(NOT pg_catalog.has_table_privilege('authenticated','private.team_action_cooldowns','INSERT,UPDATE,DELETE'),
 'authenticated callers cannot mutate durable cooldown state');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='private.team_action_cooldowns'::regclass),
 'durable cooldown table enables RLS');
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000001042';
SELECT is((SELECT count(*)::int FROM private.team_action_cooldowns WHERE user_id='00000000-0000-0000-0000-000000001042'),0,
 'deleting the Auth user cascades only that user cooldown state');
SELECT * FROM finish();
ROLLBACK;
