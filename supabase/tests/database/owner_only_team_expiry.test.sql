BEGIN;
SELECT plan(69);

-- Installed state: scheduling cannot activate expiry before the warning UI is verified.
SELECT ok((SELECT warnings_started_at IS NULL
  FROM private.owner_only_team_cleanup), 'migrations leave the warning clock off');
SELECT ok((SELECT NOT deletion_enabled FROM private.owner_only_team_cleanup), 'migrations leave deletion disabled');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'owner-only-team-cleanup'), '17 * * * *',
  'cleanup runs hourly');
SELECT ok((SELECT active AND command LIKE '%private.run_owner_only_team_cleanup(100)%'
  FROM cron.job WHERE jobname = 'owner-only-team-cleanup'), 'the scheduled job runs the bounded runner');
SELECT is((SELECT count(*)::integer FROM cron.job WHERE jobname = 'owner-only-team-cleanup'), 1,
  'the cleanup job is scheduled once');
-- Exercise the lifecycle from the inert gate the schema migration installs.
UPDATE private.owner_only_team_cleanup SET warnings_started_at = NULL, deletion_enabled = false;

CREATE TEMP TABLE expiry_users AS SELECT name, gen_random_uuid() AS id
  FROM unnest(ARRAY['owner','member','successor','outsider']) name;
INSERT INTO auth.users(id,email) SELECT id, name || '-' || id || '@example.invalid' FROM expiry_users;
CREATE FUNCTION pg_temp.expiry_user(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM expiry_users WHERE name = p_name;
$$;
CREATE TEMP TABLE expiry_teams(name text PRIMARY KEY, id uuid);
INSERT INTO expiry_teams SELECT 'legacy', (public.create_team_with_owner(
  'Legacy solo', 'legacy-solo-code', 5, pg_temp.expiry_user('owner'), 'pvp')).id;
CREATE FUNCTION pg_temp.expiry_team(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM expiry_teams WHERE name = p_name;
$$;
UPDATE public.teams SET created_at = now() - interval '3 years' WHERE id = pg_temp.expiry_team('legacy');
SELECT is((SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  NULL::timestamptz, 'schema installation does not start clocks');
CREATE TEMP TABLE inactive_receipts AS SELECT count(*) AS receipts FROM private.owner_only_team_cleanup_receipts;
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()), 0, 'runner is inert before warning activation');
SELECT is((SELECT owner_only_expires_at FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  NULL::timestamptz, 'a delayed UI deployment consumes none of the owner warning period');
SELECT is((SELECT count(*) FROM private.owner_only_team_cleanup_receipts), (SELECT receipts FROM inactive_receipts),
  'scheduled runs before warning acceptance record no active batch');
CREATE TEMP TABLE warning_start AS SELECT private.begin_owner_only_team_warnings() AS started;
SELECT is(private.begin_owner_only_team_warnings(), (SELECT started FROM warning_start), 'warning activation is idempotent');
SELECT is((SELECT initialized FROM private.run_owner_only_team_cleanup()), 1, 'bounded runner initializes the legacy solo team');
SELECT is((SELECT initialized FROM private.owner_only_team_cleanup_receipts ORDER BY completed_at DESC LIMIT 1),
  1, 'successful active initialization persists its aggregate receipt');
SELECT ok((SELECT owner_only_since >= (SELECT started FROM warning_start) AND
  owner_only_expires_at = owner_only_since + interval '168 hours' FROM public.teams
  WHERE id = pg_temp.expiry_team('legacy')), 'legacy solo gets seven full days from fresh server time, not created_at');

CREATE TEMP TABLE original_clock AS SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy');
SELECT public.record_account_activity(pg_temp.expiry_user('owner'));
UPDATE public.teams SET name = 'Renamed active solo' WHERE id = pg_temp.expiry_team('legacy');
SELECT is((SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  (SELECT owner_only_since FROM original_clock), 'activity and metadata do not reset the clock');
SELECT public.join_team(pg_temp.expiry_team('legacy'), 'legacy-solo-code', pg_temp.expiry_user('member'));
SELECT is((SELECT owner_only_expires_at FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  NULL::timestamptz, 'joining cancels the deadline');
SELECT is(public.leave_team(pg_temp.expiry_team('legacy'), pg_temp.expiry_user('member')), 'left', 'last member can leave');
SELECT ok((SELECT owner_only_since > (SELECT owner_only_since FROM original_clock) FROM public.teams
  WHERE id = pg_temp.expiry_team('legacy')), 'last departure starts a fresh clock');
SELECT public.join_team(pg_temp.expiry_team('legacy'), 'legacy-solo-code', pg_temp.expiry_user('member'));
SELECT is(public.kick_team(pg_temp.expiry_team('legacy'), pg_temp.expiry_user('owner'), pg_temp.expiry_user('member')),
  'kicked', 'last member can be kicked');
SELECT ok((SELECT owner_only_expires_at > clock_timestamp() + interval '167 hours' FROM public.teams
  WHERE id = pg_temp.expiry_team('legacy')), 'last kick starts a full grace');

-- Rollback of a later event failure restores the clock, membership and pointer together.
CREATE FUNCTION pg_temp.reject_expiry_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test: event rejected'; END;
$$;
CREATE TRIGGER zzz_expiry_event_failure BEFORE INSERT ON public.team_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_expiry_event();
CREATE TEMP TABLE rollback_clock AS SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy');
SELECT throws_ok($$SELECT public.join_team(pg_temp.expiry_team('legacy'), 'legacy-solo-code', pg_temp.expiry_user('successor'))$$,
  'test: event rejected', 'failed join aborts the transaction');
SELECT is((SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  (SELECT owner_only_since FROM rollback_clock), 'failed join restores the clock');
SELECT is((SELECT count(*)::integer FROM public.team_memberships WHERE user_id = pg_temp.expiry_user('successor')),
  0, 'failed join restores membership');
SELECT is((SELECT pvp_team_id FROM public.user_system WHERE user_id = pg_temp.expiry_user('successor')),
  NULL::uuid, 'failed join restores the personal team pointer');
DROP TRIGGER zzz_expiry_event_failure ON public.team_events;

SELECT public.join_team(pg_temp.expiry_team('legacy'), 'legacy-solo-code', pg_temp.expiry_user('successor'));
SELECT public.transfer_team_ownership(pg_temp.expiry_team('legacy'), pg_temp.expiry_user('owner'), pg_temp.expiry_user('successor'));
SELECT is((SELECT owner_only_since FROM public.teams WHERE id = pg_temp.expiry_team('legacy')),
  NULL::timestamptz, 'ownership transfer in a populated team keeps the clock cancelled');
-- The raw Auth FK cascade is also an authoritative departure path.
DELETE FROM auth.users WHERE id = pg_temp.expiry_user('owner');
SELECT ok((SELECT owner_only_since IS NOT NULL AND owner_id = pg_temp.expiry_user('successor')
  FROM public.teams WHERE id = pg_temp.expiry_team('legacy')), 'account cascade starts the new actual owner clock');

UPDATE public.teams SET owner_only_since = clock_timestamp() - interval '8 days',
  owner_only_expires_at = clock_timestamp() - interval '1 day' WHERE id = pg_temp.expiry_team('legacy');
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()), 0, 'warning-only mode never deletes expired teams');
UPDATE private.owner_only_team_cleanup SET deletion_enabled = true;
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()), 0, 'activation still enforces seven days of warning availability');
UPDATE private.owner_only_team_cleanup SET warnings_started_at = clock_timestamp() - interval '8 days';
UPDATE public.teams SET owner_only_since = clock_timestamp() - interval '168 hours' + interval '30 seconds',
  owner_only_expires_at = clock_timestamp() + interval '30 seconds' WHERE id = pg_temp.expiry_team('legacy');
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()), 0, 'just under seven consecutive days is preserved');

-- Preserve populated and inconsistent-owner teams despite forged/stale due clocks.
INSERT INTO expiry_teams SELECT 'populated', (public.create_team_with_owner(
  'Populated', 'populated-code', 5, pg_temp.expiry_user('outsider'), 'pve')).id;
SELECT public.join_team(pg_temp.expiry_team('populated'), 'populated-code', pg_temp.expiry_user('member'));
INSERT INTO public.teams(name,join_code,owner_id,game_mode) VALUES
  ('Zero members','zero-members-code',pg_temp.expiry_user('outsider'),'pvp'),
  ('Missing owner','missing-owner-code',pg_temp.expiry_user('outsider'),'seasonal');
INSERT INTO expiry_teams SELECT name, id FROM public.teams WHERE name IN ('Zero members','Missing owner');
INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
  VALUES (pg_temp.expiry_team('Missing owner'),pg_temp.expiry_user('member'),'member','seasonal');
UPDATE public.teams SET owner_only_since = now() - interval '8 days', owner_only_expires_at = now() - interval '1 day'
  WHERE id IN (SELECT id FROM expiry_teams WHERE name <> 'legacy');
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()), 0, 'populated, empty and inconsistent teams are excluded on fresh membership evidence');
SELECT is((SELECT count(*)::integer FROM public.teams WHERE id IN (SELECT id FROM expiry_teams)), 4,
  'excluded teams and not-yet-due solo all remain');
SELECT is((SELECT owner_only FROM private.owner_only_team_cleanup_status), 1::bigint, 'aggregate report counts actual owner-only teams');
SELECT is((SELECT populated FROM private.owner_only_team_cleanup_status), 1::bigint, 'aggregate report counts populated teams');
SELECT is((SELECT empty FROM private.owner_only_team_cleanup_status), 1::bigint, 'aggregate report counts empty anomalies');
SELECT is((SELECT inconsistent FROM private.owner_only_team_cleanup_status), 1::bigint, 'aggregate report counts inconsistent-owner anomalies');
SELECT is((SELECT in_grace FROM private.owner_only_team_cleanup_status), 1::bigint, 'aggregate report counts fresh grace');
SELECT is((SELECT due FROM private.owner_only_team_cleanup_status), 0::bigint, 'aggregate report excludes populated and anomalous stale deadlines');

-- Seed real all-mode progress with manual history plus an archived Seasonal row.
CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS smallint LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT 2::smallint; $$;
SELECT set_config('request.jwt.claim.sub', pg_temp.expiry_user('successor')::text, true);
SELECT public.sync_user_game_mode_progress('pvp',1,NULL,
  '{"pvp":{"level":12,"taskCompletions":{"q":{"complete":true}},"manualActivityHistory":[{"id":"pvp-history","timestamp":1,"type":"task","action":"complete","title":"Q"}]},"pve":{"level":22},"seasonal":{"level":32}}',
  private.active_season_number());
INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data)
  VALUES(pg_temp.expiry_user('successor'),'seasonal',private.active_season_number()-1,'{"level":42,"manualActivityHistory":[{"id":"archived"}]}');
INSERT INTO public.user_preferences(user_id,streamer_mode) VALUES(pg_temp.expiry_user('successor'),true);
INSERT INTO public.api_tokens(user_id,token_hash,note,game_mode) VALUES(pg_temp.expiry_user('successor'),'expiry-local-test-token','preserve','pvp');
INSERT INTO expiry_teams SELECT mode, (public.create_team_with_owner(
  'Solo ' || mode, 'solo-preserve-' || mode, 5, pg_temp.expiry_user('successor'), mode)).id
  FROM unnest(ARRAY['pve','seasonal']) mode;
CREATE TEMP TABLE personal_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY game_mode,season_number) FROM public.user_game_mode_progress p WHERE user_id=pg_temp.expiry_user('successor')) AS modes,
  (SELECT to_jsonb(p) FROM public.user_progress p WHERE user_id=pg_temp.expiry_user('successor')) AS legacy,
  (SELECT to_jsonb(p) FROM public.user_preferences p WHERE user_id=pg_temp.expiry_user('successor')) AS preferences,
  (SELECT jsonb_agg(to_jsonb(p)) FROM public.api_tokens p WHERE user_id=pg_temp.expiry_user('successor')) AS tokens,
  (SELECT to_jsonb(p) FROM auth.users p WHERE id=pg_temp.expiry_user('successor')) AS account;
UPDATE public.teams SET owner_only_since = clock_timestamp() - interval '168 hours',
  owner_only_expires_at = clock_timestamp() WHERE owner_id = pg_temp.expiry_user('successor');
CREATE FUNCTION pg_temp.reject_expiry_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test: delete rejected'; END;
$$;
CREATE TRIGGER zzz_expiry_delete_failure BEFORE DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_expiry_delete();
CREATE TEMP TABLE receipt_before_failure AS SELECT count(*) AS receipts FROM private.owner_only_team_cleanup_receipts;
SELECT throws_ok($$SELECT private.run_owner_only_team_cleanup()$$,'test: delete rejected','disband failure aborts cleanup');
SELECT is((SELECT count(*) FROM private.owner_only_team_cleanup_receipts), (SELECT receipts FROM receipt_before_failure),
  'failed batch commits no successful deletion receipt');
SELECT is((SELECT count(*)::integer FROM public.team_memberships WHERE user_id=pg_temp.expiry_user('successor')),3,
  'failed cleanup restores all memberships');
SELECT ok((SELECT pvp_team_id IS NOT NULL AND pve_team_id IS NOT NULL AND seasonal_team_id IS NOT NULL
  FROM public.user_system WHERE user_id=pg_temp.expiry_user('successor')), 'failed cleanup restores all mode pointers');
DROP TRIGGER zzz_expiry_delete_failure ON public.teams;
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup(1)),1,'bounded batch expires one due team');
SELECT is((SELECT num_nonnulls(pvp_team_id,pve_team_id,seasonal_team_id) FROM public.user_system
  WHERE user_id=pg_temp.expiry_user('successor')),2,'one mode expiry leaves the other team pointers intact');
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()),2,'deadline reached: expiry disbands the remaining owner-only modes');
SELECT is((SELECT disbanded FROM private.owner_only_team_cleanup_receipts ORDER BY completed_at DESC LIMIT 1),
  2, 'successful disband batch persists actual aggregate deletion count');
SELECT is((SELECT jsonb_agg(to_jsonb(p) ORDER BY game_mode,season_number) FROM public.user_game_mode_progress p WHERE user_id=pg_temp.expiry_user('successor')),
  (SELECT modes FROM personal_before), 'active modes, progress and archived Seasonal history are byte-for-byte preserved');
SELECT is((SELECT to_jsonb(p) FROM public.user_progress p WHERE user_id=pg_temp.expiry_user('successor')),
  (SELECT legacy FROM personal_before),'legacy personal progress is untouched');
SELECT is((SELECT to_jsonb(p) FROM public.user_preferences p WHERE user_id=pg_temp.expiry_user('successor')),
  (SELECT preferences FROM personal_before),'preferences are untouched');
SELECT is((SELECT jsonb_agg(to_jsonb(p)) FROM public.api_tokens p WHERE user_id=pg_temp.expiry_user('successor')),
  (SELECT tokens FROM personal_before),'API tokens are untouched');
SELECT is((SELECT to_jsonb(p) FROM auth.users p WHERE id=pg_temp.expiry_user('successor')),
  (SELECT account FROM personal_before),'owner account and activity are untouched');
SELECT ok((SELECT pvp_team_id IS NULL AND pve_team_id IS NULL AND seasonal_team_id IS NULL
  FROM public.user_system WHERE user_id=pg_temp.expiry_user('successor')), 'disband semantics clear all affected mode pointers');
SELECT is((SELECT count(*)::integer FROM public.team_events WHERE team_id IN (SELECT id FROM expiry_teams WHERE name IN ('legacy','pve','seasonal'))),0,
  'team events cascade with expired teams');
SELECT is((SELECT disbanded FROM private.run_owner_only_team_cleanup()),0,'repeated cleanup is idempotent');

INSERT INTO private.owner_only_team_cleanup_receipts(completed_at,initialized,disbanded,deletion_enabled)
  SELECT clock_timestamp()-interval '31 days'-n*interval '1 second',0,0,false FROM generate_series(1,101) n;
SELECT initialized FROM private.run_owner_only_team_cleanup();
SELECT is((SELECT count(*) FROM private.owner_only_team_cleanup_receipts WHERE completed_at < now()-interval '30 days'),
  1::bigint, 'receipt retention pruning is bounded to 100 old rows per batch');
INSERT INTO private.owner_only_team_cleanup_receipts(completed_at,initialized,disbanded,deletion_enabled)
  SELECT clock_timestamp()-n*interval '1 second',0,0,false FROM generate_series(1,22) n;
SELECT is((SELECT jsonb_array_length(recent_receipts) FROM private.owner_only_team_cleanup_status),20,
  'aggregate report returns only the latest 20 receipts');
SELECT is((SELECT array_agg(key ORDER BY key) FROM private.owner_only_team_cleanup_status,
  LATERAL jsonb_object_keys(recent_receipts->0) AS keys(key)),
  ARRAY['completed_at','deletion_enabled','disbanded','initialized']::text[], 'receipt fields contain no identities or payloads');

CREATE ROLE expiry_test_observer NOLOGIN;
GRANT expiry_test_observer TO postgres;
GRANT USAGE ON SCHEMA public, extensions TO expiry_test_observer;
GRANT USAGE ON SCHEMA private TO expiry_test_observer;
GRANT SELECT ON private.owner_only_team_cleanup_status TO expiry_test_observer;
SET LOCAL ROLE expiry_test_observer;
SELECT is((SELECT populated FROM private.owner_only_team_cleanup_status),1::bigint,
  'dedicated observer can read the aggregate view without underlying table grants');
RESET ROLE;
SELECT ok(NOT has_table_privilege('expiry_test_observer','public.teams','SELECT'), 'aggregate observer cannot read team rows');
SELECT ok(NOT has_table_privilege('expiry_test_observer','public.team_memberships','SELECT'), 'aggregate observer cannot read memberships');
SELECT ok(NOT has_table_privilege('expiry_test_observer','private.owner_only_team_cleanup_receipts','SELECT'), 'aggregate observer cannot read receipt base table');

SELECT ok(NOT has_schema_privilege(role,'private','USAGE') OR NOT has_function_privilege(role,
  'private.run_owner_only_team_cleanup(integer)','EXECUTE'),role || ' cannot run cleanup')
  FROM unnest(ARRAY['anon','authenticated','service_role']) role;
SELECT ok(NOT has_function_privilege(role,'private.begin_owner_only_team_warnings()','EXECUTE'),
  role || ' cannot start or reset warning activation') FROM unnest(ARRAY['anon','authenticated','service_role']) role;
SELECT ok(NOT has_table_privilege('authenticated','public.teams','UPDATE'), 'clients cannot forge a clock');
SELECT ok(NOT has_table_privilege(role,'private.owner_only_team_cleanup_status','SELECT'),
  role || ' cannot read the restricted aggregate report') FROM unnest(ARRAY['anon','authenticated','service_role']) role;
SELECT * FROM finish();
ROLLBACK;
