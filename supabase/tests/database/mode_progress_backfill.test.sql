BEGIN;
SELECT plan(25);

-- PL/pgSQL checks function privileges once per session, so service_role must be the first caller.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000001105', 'service-backfill@example.invalid');
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;
SELECT lives_ok($$
  INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
  VALUES ('00000000-0000-0000-0000-000000001105', 'pvp', 0, '{"level":3}')
$$, 'service_role writes still pass the prepare trigger');
RESET ROLE;

CREATE TEMP TABLE backfill_fixture (name text PRIMARY KEY, user_id uuid NOT NULL);
INSERT INTO backfill_fixture VALUES
  ('missing', '00000000-0000-0000-0000-000000001101'),
  ('placeholder', '00000000-0000-0000-0000-000000001102'),
  ('normalized', '00000000-0000-0000-0000-000000001103'),
  ('empty', '00000000-0000-0000-0000-000000001104'),
  ('undated', '00000000-0000-0000-0000-000000001106');
CREATE FUNCTION pg_temp.fixture_user(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT user_id FROM backfill_fixture WHERE name = p_name;
$$;
CREATE FUNCTION pg_temp.mode_row(p_name text, p_mode text)
RETURNS public.user_game_mode_progress LANGUAGE sql AS $$
  SELECT * FROM public.user_game_mode_progress
  WHERE user_id = pg_temp.fixture_user(p_name) AND game_mode = p_mode AND season_number = 0;
$$;
CREATE FUNCTION pg_temp.remaining() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM private.unmaterialized_mode_progress(
    '00000000-0000-0000-0000-000000001100', '00000000-0000-0000-0000-000000001200');
$$;
CREATE FUNCTION pg_temp.backfill() RETURNS bigint LANGUAGE sql AS $$
  SELECT private.backfill_game_mode_progress_range(
    '00000000-0000-0000-0000-000000001100', '00000000-0000-0000-0000-000000001200');
$$;

-- Build legacy-only accounts with their source timestamps preserved.
ALTER TABLE public.user_progress DISABLE TRIGGER set_user_progress_updated_at;
INSERT INTO auth.users (id, email, created_at, last_sign_in_at)
SELECT user_id, name || '-backfill@example.invalid', now() - interval '2 years',
  now() - interval '2 years' FROM backfill_fixture;
DELETE FROM public.user_game_mode_progress
WHERE user_id IN (SELECT user_id FROM backfill_fixture);
UPDATE public.user_progress SET
  pvp_data = CASE user_id
    WHEN pg_temp.fixture_user('missing') THEN '{"level":20}'::jsonb
    WHEN pg_temp.fixture_user('placeholder') THEN '{"level":30}'::jsonb
    WHEN pg_temp.fixture_user('normalized') THEN '{"level":40}'::jsonb
    WHEN pg_temp.fixture_user('undated') THEN '{"level":10}'::jsonb
    ELSE '{}'::jsonb END,
  pve_data = CASE user_id
    WHEN pg_temp.fixture_user('missing') THEN '{"level":5}'::jsonb
    ELSE '{}'::jsonb END,
  created_at = now() - interval '2 years',
  updated_at = CASE WHEN user_id = pg_temp.fixture_user('undated') THEN NULL
    ELSE now() - interval '1 year' END
WHERE user_id IN (SELECT user_id FROM backfill_fixture);
ALTER TABLE public.user_progress ENABLE TRIGGER set_user_progress_updated_at;

INSERT INTO public.user_preferences (user_id, profile_share_pvp_public, created_at, updated_at)
VALUES (pg_temp.fixture_user('missing'), true, now() - interval '2 years', now() - interval '1 year');
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data, profile_public)
VALUES
  (pg_temp.fixture_user('placeholder'), 'pvp', 0, '{}', true),
  (pg_temp.fixture_user('normalized'), 'pvp', 0, '{"level":41}', false);
UPDATE public.user_game_mode_progress SET updated_at = now() - interval '10 months'
WHERE user_id IN (pg_temp.fixture_user('placeholder'), pg_temp.fixture_user('normalized'));
CREATE TEMP TABLE normalized_before AS SELECT * FROM pg_temp.mode_row('normalized', 'pvp');

DELETE FROM private.account_retention WHERE user_id IN (SELECT user_id FROM backfill_fixture);
INSERT INTO private.account_retention (user_id, last_active_at, pending_since)
SELECT user_id, private.account_last_activity(user_id), now() - interval '10 days' FROM backfill_fixture;
CREATE TEMP TABLE retention_before AS
SELECT r.*, private.account_retention_deadline(r.user_id) AS deadline
FROM private.account_retention r WHERE r.user_id IN (SELECT user_id FROM backfill_fixture);

SELECT is(pg_temp.remaining(), 4::bigint, 'gate counts legacy-only modes and the placeholder');

-- A range that meets a lock must roll back completely and succeed when retried.
CREATE FUNCTION pg_temp.simulate_lock_timeout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'simulated lock timeout' USING ERRCODE = '55P03';
END;
$$;
CREATE TRIGGER simulate_lock_timeout BEFORE UPDATE ON public.user_game_mode_progress
FOR EACH ROW EXECUTE FUNCTION pg_temp.simulate_lock_timeout();
SELECT throws_ok('SELECT pg_temp.backfill()', '55P03', NULL, 'a lock failure aborts the range');
SELECT is(pg_temp.mode_row('missing', 'pvp'), NULL, 'an aborted range keeps none of its inserts');
DROP TRIGGER simulate_lock_timeout ON public.user_game_mode_progress;

SELECT is(pg_temp.backfill(), 4::bigint, 'retry inserts missing modes and repairs the placeholder');
SELECT is(pg_temp.remaining(), 0::bigint, 'completion gate reaches zero');
SELECT is(pg_temp.backfill(), 0::bigint, 'a completed range is a no-op');
SELECT ok(NOT private.mode_progress_backfill_active(), 'the backfill flag is restored on return');

SELECT is((pg_temp.mode_row('missing', 'pvp')).progress_data->'level', '20'::jsonb, 'copies missing PvP progress');
SELECT is((pg_temp.mode_row('missing', 'pve')).progress_data->'level', '5'::jsonb, 'copies missing PvE progress');
SELECT ok((pg_temp.mode_row('missing', 'pvp')).profile_public, 'new rows carry the legacy PvP sharing setting');
SELECT ok(NOT (pg_temp.mode_row('missing', 'pve')).profile_public, 'new rows carry the legacy PvE sharing setting');
SELECT is((pg_temp.mode_row('missing', 'pvp')).updated_at,
  (SELECT updated_at FROM public.user_progress WHERE user_id = pg_temp.fixture_user('missing')),
  'new rows keep the legacy timestamp');
SELECT is((pg_temp.mode_row('missing', 'pvp')).progress_updated_at, NULL, 'new rows record unknown freshness');
SELECT is((pg_temp.mode_row('undated', 'pvp')).updated_at,
  (SELECT created_at FROM auth.users WHERE id = pg_temp.fixture_user('undated')),
  'an undated legacy row falls back to account creation, not the backfill time');

SELECT is((pg_temp.mode_row('placeholder', 'pvp')).progress_data->'level', '30'::jsonb, 'repairs a placeholder');
SELECT ok((pg_temp.mode_row('placeholder', 'pvp')).profile_public, 'repair preserves explicit sharing');
SELECT is((pg_temp.mode_row('placeholder', 'pvp')).updated_at, now() - interval '10 months',
  'repair keeps the row timestamp');
SELECT is((pg_temp.mode_row('placeholder', 'pvp')).progress_updated_at, NULL, 'repair records unknown freshness');

SELECT is((SELECT row_to_json(n)::text FROM pg_temp.mode_row('normalized', 'pvp') n),
  (SELECT row_to_json(n)::text FROM normalized_before n), 'normalized progress is never touched');
SELECT is(pg_temp.mode_row('empty', 'pvp'), NULL, 'a legacy payload without a level is not materialized');

SELECT is(
  (SELECT array_agg((r.last_active_at, r.pending_since, private.account_retention_deadline(r.user_id))::text ORDER BY r.user_id)
    FROM private.account_retention r WHERE r.user_id IN (SELECT user_id FROM backfill_fixture)),
  (SELECT array_agg((last_active_at, pending_since, deadline)::text ORDER BY user_id) FROM retention_before),
  'backfill records no activity and keeps every deadline');
SELECT private.snapshot_account_activity();
SELECT is(
  (SELECT array_agg((r.last_active_at, r.pending_since, private.account_retention_deadline(r.user_id))::text ORDER BY r.user_id)
    FROM private.account_retention r WHERE r.user_id IN (SELECT user_id FROM backfill_fixture)),
  (SELECT array_agg((last_active_at, pending_since, deadline)::text ORDER BY user_id) FROM retention_before),
  'the daily snapshot still sees no new activity');

UPDATE public.user_game_mode_progress SET progress_data = '{"level":21}'
WHERE user_id = pg_temp.fixture_user('missing') AND game_mode = 'pvp';
SELECT ok((pg_temp.mode_row('missing', 'pvp')).progress_updated_at IS NOT NULL
  AND (SELECT pending_since IS NULL FROM private.account_retention WHERE user_id = pg_temp.fixture_user('missing')),
  'a real save after the backfill records freshness and activity');

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.backfill_game_mode_progress_range(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.unmaterialized_mode_progress(uuid, uuid)', 'EXECUTE'),
  'clients cannot run the backfill or its gate');

SELECT * FROM finish();
ROLLBACK;
