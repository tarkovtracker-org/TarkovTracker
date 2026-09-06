-- Schedule the 90-day retention policy for account_deletion_attempts, matching
-- the privacy-policy disclosure. The table holds raw IP and User-Agent strings
-- captured at account-deletion request time, and the user_id foreign key is
-- ON DELETE SET NULL so the rows survive account deletion; without this job
-- they would persist indefinitely.
--
-- Uses public.cleanup_old_deletion_attempts() (service_role-only EXECUTE,
-- pg_cron runs as the database owner) rather than an inline DELETE so the
-- single retention implementations stay shared with any manual invocation.
--
-- Mirrors 20260807130000_add_usage_and_rate_limit_retention.sql, including the
-- idempotent unschedule-then-schedule guard (cron.schedule throws on a
-- duplicate jobname and cron.unschedule raises when the job is missing).
-- 45 3 UTC keeps it staggered behind the other nightly cleanup jobs.
-- An 89-day window keeps actual retention at or under the disclosed 90-day
-- maximum despite the once-daily run cadence (a row created just after a run
-- would otherwise persist ~91 days).
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

DO $$
DECLARE
  v_job_name CONSTANT TEXT := 'account-deletion-attempts-cleanup';
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job_name) THEN
    PERFORM cron.unschedule(v_job_name);
  END IF;
  PERFORM cron.schedule(
    v_job_name,
    '45 3 * * *',
    'SELECT public.cleanup_old_deletion_attempts(89)'
  );
END;
$$;
