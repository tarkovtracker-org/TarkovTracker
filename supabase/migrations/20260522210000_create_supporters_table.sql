-- Supporters table: tracks payment status, tier, and Discord role sync
CREATE TABLE IF NOT EXISTS public.supporters (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'supporter' CHECK (tier IN ('supporter', 'scav', 'timmy', 'chad')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'expired', 'cancelled')),
  type TEXT NOT NULL DEFAULT 'subscription' CHECK (type IN ('one_time', 'subscription')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  has_ever_supported BOOLEAN NOT NULL DEFAULT false,
  discord_user_id TEXT,
  amount_total INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supporters_stripe_customer ON public.supporters(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_supporters_stripe_subscription ON public.supporters(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_supporters_status ON public.supporters(status);

-- Enforce one supporter row per Stripe customer / subscription so the webhook
-- handlers can safely use maybeSingle() without ambiguous matches. Partial
-- indexes allow NULLs (one-time payments may have no subscription, etc.).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporters_stripe_customer
  ON public.supporters(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporters_stripe_subscription
  ON public.supporters(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.supporters ENABLE ROW LEVEL SECURITY;

-- Users can read their own supporter row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supporters' AND policyname = 'Users can view own supporter row'
  ) THEN
    CREATE POLICY "Users can view own supporter row" ON public.supporters
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role (edge functions) can do everything via bypassing RLS,
-- but add an explicit policy for admin reads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supporters' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.supporters
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_supporters_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supporters_updated_at ON public.supporters;
CREATE TRIGGER trg_supporters_updated_at
  BEFORE UPDATE ON public.supporters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supporters_updated_at();
