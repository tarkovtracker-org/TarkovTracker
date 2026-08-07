-- Implement the retention policies documented in docs/RATE_LIMITING.md, which
-- were specified but never scheduled.
--
-- api_usage_daily: 180 days, the top of the documented 90-180 day range. The
-- admin usage endpoint only reads the last two UTC days, so the longer window is
-- purely for trend/abuse analysis. idx_api_usage_daily_day backs the range scan.
--
-- mutation_rate_limits: rows are dead once reset_at has passed; 1 day of slack
-- keeps them available for incident triage. The table holds ~140 live rows, so
-- the sequential scan is irrelevant.
--
-- Mirrors 20260523130000_stripe_events_retention.sql, including the idempotent
-- unschedule-then-schedule guard (cron.schedule throws on a duplicate jobname
-- and cron.unschedule raises when the job is missing). Times are staggered so
-- the nightly jobs do not overlap stripe-events-cleanup at 03:00.
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'api-usage-daily-cleanup') THEN
    PERFORM cron.unschedule('api-usage-daily-cleanup');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mutation-rate-limits-cleanup') THEN
    PERFORM cron.unschedule('mutation-rate-limits-cleanup');
  END IF;
END;
$$;

SELECT cron.schedule(
  'api-usage-daily-cleanup',
  '15 3 * * *',
  $$DELETE FROM public.api_usage_daily
    WHERE day < ((NOW() AT TIME ZONE 'utc')::date - 180)$$
);

SELECT cron.schedule(
  'mutation-rate-limits-cleanup',
  '30 3 * * *',
  $$DELETE FROM public.mutation_rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'$$
);
