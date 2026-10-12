-- Automatic owner-only team disband. Starts warnings and enables deletion in the singleton gate
-- (one row, no team rewrite), then schedules the bounded hourly runner. The runner initializes
-- legacy solo teams lazily and still disbands only after greatest(team deadline,
-- warnings_started_at + 168 hours), so nothing can be deleted for seven days after this applies.
-- Kill switch: UPDATE private.owner_only_team_cleanup SET deletion_enabled = false (warnings and
-- clocks continue), or cron.unschedule('owner-only-team-cleanup') to stop the runner entirely.
SET LOCAL lock_timeout = '5s';

SELECT private.begin_owner_only_team_warnings();
UPDATE private.owner_only_team_cleanup SET deletion_enabled = true WHERE NOT deletion_enabled;

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
