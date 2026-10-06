BEGIN;
SELECT plan(25);

CREATE TEMP TABLE retry_fixture (name text PRIMARY KEY, user_id uuid NOT NULL);
INSERT INTO retry_fixture
SELECT name, ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
FROM (VALUES
  (2001, 'solo_owner'), (2002, 'not_due'), (2003, 'dead'), (2004, 'gone'),
  (2005, 'leased'), (2006, 'stale'), (2007, 'broken'), (2008, 'last_try'),
  (2009, 'stored'), (2010, 'fk_owner')
) AS fixtures(n, name);
CREATE FUNCTION pg_temp.retry_user(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT user_id FROM retry_fixture WHERE name = p_name;
$$;
CREATE FUNCTION pg_temp.retry_job(p_name text) RETURNS public.account_deletion_jobs LANGUAGE sql AS $$
  SELECT * FROM public.account_deletion_jobs WHERE user_id = pg_temp.retry_user(p_name);
$$;

INSERT INTO auth.users(id, email)
SELECT user_id, name || '-retry@example.invalid' FROM retry_fixture WHERE name <> 'gone';

INSERT INTO public.teams(id, name, join_code, owner_id, game_mode) VALUES
  ('00000000-0000-0000-0000-000000002101', 'Retry solo', 'retry-solo', pg_temp.retry_user('solo_owner'), 'pvp'),
  ('00000000-0000-0000-0000-000000002102', 'FK solo', 'fk-solo', pg_temp.retry_user('fk_owner'), 'pvp');
INSERT INTO public.team_memberships(team_id, user_id, role, game_mode) VALUES
  ('00000000-0000-0000-0000-000000002101', pg_temp.retry_user('solo_owner'), 'owner', 'pvp'),
  ('00000000-0000-0000-0000-000000002102', pg_temp.retry_user('fk_owner'), 'owner', 'pvp');
INSERT INTO public.team_events(team_id, event_type, initiated_by)
VALUES ('00000000-0000-0000-0000-000000002101', 'member_joined', pg_temp.retry_user('solo_owner'));
INSERT INTO public.api_usage_daily(user_id, token_id, day, reads)
VALUES (pg_temp.retry_user('solo_owner'), 'retry-test', current_date, 1);

INSERT INTO public.account_deletion_jobs(user_id, status, attempts, max_attempts, next_run_at, updated_at)
VALUES
  (pg_temp.retry_user('solo_owner'), 'failed', 2, 5, now() - interval '1 day', now() - interval '1 day'),
  (pg_temp.retry_user('not_due'), 'failed', 1, 5, now() + interval '1 day', now()),
  (pg_temp.retry_user('dead'), 'dead_lettered', 5, 5, NULL, now() - interval '1 day'),
  (pg_temp.retry_user('gone'), 'failed', 1, 5, now() - interval '1 day', now() - interval '1 day'),
  (pg_temp.retry_user('leased'), 'in_progress', 1, 5, NULL, now()),
  (pg_temp.retry_user('stale'), 'in_progress', 1, 5, NULL, now() - interval '1 hour'),
  (pg_temp.retry_user('broken'), 'failed', 1, 5, now() - interval '1 day', now() - interval '1 day'),
  (pg_temp.retry_user('last_try'), 'failed', 4, 5, now() - interval '1 day', now() - interval '1 day'),
  (pg_temp.retry_user('stored'), 'failed', 1, 5, now() - interval '1 day', now() - interval '1 day');
INSERT INTO storage.buckets(id, name, owner_id)
VALUES ('retry-test', 'retry-test', pg_temp.retry_user('stored')::text);

CREATE FUNCTION pg_temp.block_retry_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IN (SELECT user_id FROM retry_fixture WHERE name IN ('broken', 'last_try')) THEN
    RAISE EXCEPTION 'simulated auth delete failure';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER block_retry_delete BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION pg_temp.block_retry_delete();

SELECT is(private.run_account_deletion_retries(50),
  jsonb_build_object('completed', 3, 'skipped', 1, 'failed', 2),
  'retries due and stale jobs, skipping storage owners and counting rollbacks');

SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = pg_temp.retry_user('solo_owner')), 0,
  'retry removes the Auth identity');
SELECT is((SELECT count(*)::integer FROM public.teams WHERE id = '00000000-0000-0000-0000-000000002101'), 0,
  'retry removes an empty owned PvP team');
SELECT is((SELECT count(*)::integer FROM public.team_events
  WHERE initiated_by = pg_temp.retry_user('solo_owner')), 0, 'retry removes team events');
SELECT is((SELECT count(*)::integer FROM public.api_usage_daily
  WHERE user_id = pg_temp.retry_user('solo_owner')), 0, 'retry removes API accounting');
SELECT is((pg_temp.retry_job('solo_owner')).status, 'completed', 'retried job completes');
SELECT is((pg_temp.retry_job('solo_owner')).claim_token, NULL::uuid, 'completion releases the claim');
SELECT is((pg_temp.retry_job('solo_owner')).last_error_details, '{"reason":"scheduled_retry"}'::jsonb,
  'completion records the retry source');

SELECT is((pg_temp.retry_job('gone')).status, 'completed', 'job for an already deleted user completes');
SELECT is((pg_temp.retry_job('stale')).status, 'completed', 'expired lease is recovered');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = pg_temp.retry_user('stale')), 0,
  'recovered lease deletes the user');

SELECT is((pg_temp.retry_job('not_due')).status, 'failed', 'job in backoff is left alone');
SELECT is(private.retry_account_deletion(pg_temp.retry_user('dead')), false,
  'direct retry cannot revive dead-lettered work');
SELECT is((pg_temp.retry_job('dead')).status, 'dead_lettered', 'dead-lettered job is not revived');
SELECT is((pg_temp.retry_job('leased')).status, 'in_progress', 'live lease is not stolen');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = pg_temp.retry_user('leased')), 1,
  'live lease user is not deleted');
SELECT is((pg_temp.retry_job('stored')).status, 'failed', 'storage owner is not deleted by SQL');

SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = pg_temp.retry_user('broken')), 1,
  'failed retry rolls back the deletion');
SELECT is((pg_temp.retry_job('broken')).attempts, 2, 'failed retry consumes one attempt');
SELECT ok((pg_temp.retry_job('broken')).next_run_at > now() + interval '23 hours',
  'failed retry backs off for a day');
SELECT is((pg_temp.retry_job('last_try')).status, 'dead_lettered', 'final failed attempt dead-letters');

DROP TRIGGER block_retry_delete ON auth.users;

DELETE FROM public.teams WHERE id = '00000000-0000-0000-0000-000000002102';
SELECT is((SELECT pvp_team_id FROM public.user_system WHERE user_id = pg_temp.retry_user('fk_owner')),
  NULL::uuid, 'deleting a PvP team clears the owner reference');

SELECT ok(NOT has_function_privilege('authenticated', 'private.run_account_deletion_retries(integer)', 'EXECUTE'),
  'authenticated callers cannot run deletion retries');
SELECT ok(NOT has_function_privilege('authenticated', 'private.retry_account_deletion(uuid)', 'EXECUTE'),
  'authenticated callers cannot retry one deletion');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'account-deletion-retry'), '30 4 * * *',
  'retry runs daily');

SELECT * FROM finish();
ROLLBACK;
