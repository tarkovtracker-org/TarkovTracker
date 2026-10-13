-- Install the bounded hourly runner without starting warning clocks or enabling deletion.
-- Database migrations and the warning UI deploy separately. Start warnings only after the
-- deployed UI and restricted observer have passed the acceptance checks in the rollout runbook;
-- enable deletion separately after a full 168-hour warning period. The scheduled runner is
-- inert while warnings_started_at is NULL and initializes clocks without deletion afterward.
SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- Idempotent (re)scheduling: cron.schedule() throws on a duplicate jobname and
-- cron.unschedule(text) raises when the job is missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'owner-only-team-cleanup') THEN
    PERFORM cron.unschedule('owner-only-team-cleanup');
  END IF;
END;
$$;

-- :17 keeps it off the top-of-hour and nightly cleanup slots. The receipt retention in the
-- runner assumes this hourly cadence.
SELECT cron.schedule(
  'owner-only-team-cleanup',
  '17 * * * *',
  $$SET statement_timeout = '60s'; SELECT * FROM private.run_owner_only_team_cleanup(100)$$
);
