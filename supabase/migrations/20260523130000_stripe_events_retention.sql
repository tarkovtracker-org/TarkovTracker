-- Retention policy for stripe_events: delete rows older than 30 days.
-- Stripe retries at most ~72h; 30 days is well beyond any replay window.
-- Requires pg_cron (available on Supabase Pro and above).
-- The idx_stripe_events_received_at index on the source table makes the
-- range scan efficient.
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- Idempotent (re)scheduling: cron.schedule() throws on duplicate jobname,
-- so unschedule any pre-existing job with the same name first. Wrap in a
-- DO block because cron.unschedule(text) raises if the job is missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-events-cleanup') THEN
    PERFORM cron.unschedule('stripe-events-cleanup');
  END IF;
END;
$$;

SELECT cron.schedule(
  'stripe-events-cleanup',
  '0 3 * * *',
  $$DELETE FROM public.stripe_events WHERE received_at < NOW() - INTERVAL '30 days'$$
);
