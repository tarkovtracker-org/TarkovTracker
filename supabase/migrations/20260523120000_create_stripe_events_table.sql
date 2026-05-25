-- Stripe webhook event idempotency table.
-- Stripe retries failed deliveries up to ~16 times over 72h. Without dedup,
-- transient failures or replays re-run side effects (Discord syncs, refund
-- count lookups, audit logs). Insert-and-check on event.id makes the
-- webhook handler safely idempotent.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON public.stripe_events(received_at);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_events' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.stripe_events
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
