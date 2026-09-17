BEGIN;
SELECT plan(9);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000901','event-owner@example.invalid'),
 ('00000000-0000-0000-0000-000000000902','event-victim@example.invalid'),
 ('00000000-0000-0000-0000-000000000903','event-outsider@example.invalid');
INSERT INTO public.teams(id,name,join_code,owner_id,game_mode)
SELECT ('00000000-0000-0000-0000-00000000091'||n)::uuid,'event-'||mode,'event-'||mode,
 '00000000-0000-0000-0000-000000000901',mode
FROM (VALUES(1,'pvp'),(2,'pve'),(3,'seasonal')) v(n,mode);
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
SELECT id,owner_id,'owner',game_mode FROM public.teams WHERE name LIKE 'event-%';
SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO public.team_events(team_id,event_type,initiated_by,target_user)
 VALUES('00000000-0000-0000-0000-000000000911','member_left',
 '00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902')$$,
 '42501',NULL,'anonymous event INSERT is denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.team_events(team_id,event_type,initiated_by,target_user,created_at)
 VALUES('00000000-0000-0000-0000-000000000911','member_left',
 '00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902',now()+interval '1 year')$$,
 '42501',NULL,'owner cannot insert a forged victim cooldown');
SELECT throws_ok($$INSERT INTO public.team_events(team_id,event_type,initiated_by,target_user)
 VALUES('00000000-0000-0000-0000-000000000911','member_left',
 '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000902')$$,
 '42501',NULL,'owner cannot forge both identities');
RESET ROLE;
SELECT ok(NOT has_any_column_privilege('authenticated','public.team_events','INSERT'),
 'no effective authenticated column INSERT, including role inheritance');
SELECT ok(NOT has_any_column_privilege('anon','public.team_events','INSERT'),
 'no effective anonymous column INSERT');
SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO public.team_events(team_id,event_type,initiated_by,target_user,created_at)
 SELECT ('00000000-0000-0000-0000-00000000091'||n)::uuid,'member_left',
 '00000000-0000-0000-0000-000000000901'::uuid,
 '00000000-0000-0000-0000-000000000901'::uuid,now()+interval '1 year'
 FROM generate_series(1,3) n$$,'server creates events in every mode');
RESET ROLE;
SELECT is(count(*)::integer,3,'new server events have trusted database time') FROM public.team_events
 WHERE team_id IN ('00000000-0000-0000-0000-000000000911','00000000-0000-0000-0000-000000000912',
 '00000000-0000-0000-0000-000000000913') AND server_verified AND created_at<=clock_timestamp()
 AND created_at>now()-interval '5 minutes';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
SET LOCAL ROLE authenticated;
SELECT is(count(*)::integer,3,'member reads still permitted') FROM public.team_events
 WHERE initiated_by='00000000-0000-0000-0000-000000000901';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000903',true);
SET LOCAL ROLE authenticated;
SELECT is(count(*)::integer,0,'outsider reads remain denied') FROM public.team_events
 WHERE initiated_by='00000000-0000-0000-0000-000000000901';
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
