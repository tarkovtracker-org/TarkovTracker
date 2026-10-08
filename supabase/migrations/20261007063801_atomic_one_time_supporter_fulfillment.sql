-- PaymentIntent identity survives different Checkout event deliveries and timestamps.
-- Keep receipts for the life of the account; event receipt retention is independent.
CREATE TABLE private.stripe_one_time_payments (
  payment_id text PRIMARY KEY CHECK (payment_id ~ '^pi_[A-Za-z0-9_]+$' AND length(payment_id) <= 255),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paid_at timestamptz NOT NULL,
  amount_total integer NOT NULL CHECK (amount_total > 0),
  fulfilled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_one_time_payments_user_id_idx ON private.stripe_one_time_payments(user_id);
ALTER TABLE private.stripe_one_time_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.stripe_one_time_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.stripe_one_time_payments TO service_role;

-- The assertion deliberately has no caller grants. This narrow private wrapper
-- lets the invoker RPC fence at entry without elevating its billing writes.
CREATE FUNCTION private.assert_one_time_stripe_event_claim()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_stripe_event_claim();
END;
$$;
REVOKE ALL ON FUNCTION private.assert_one_time_stripe_event_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_one_time_stripe_event_claim() TO service_role;

CREATE FUNCTION public.fulfill_one_time_supporter(p_payment_id text, p_paid_at timestamptz, p_record jsonb)
RETURNS public.supporters LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  target_user uuid;
  amount integer;
  incoming_tier text;
  existing public.supporters%ROWTYPE;
  fulfilled public.supporters%ROWTYPE;
  receipt_user uuid;
  live_subscription boolean;
  expiry timestamptz;
BEGIN
  -- Always event -> user -> supporter: stale claims fail before any billing lock.
  PERFORM private.assert_one_time_stripe_event_claim();
  target_user := (p_record->>'user_id')::uuid;
  amount := (p_record->>'amount_total')::integer;
  incoming_tier := p_record->>'tier';
  IF p_payment_id IS NULL OR p_payment_id !~ '^pi_[A-Za-z0-9_]+$' OR length(p_payment_id) > 255
    OR target_user IS NULL OR amount IS NULL OR amount <= 0
    OR incoming_tier IS NULL OR incoming_tier NOT IN ('supporter', 'scav', 'timmy', 'chad')
    OR p_paid_at IS NULL OR NOT isfinite(p_paid_at) OR p_paid_at > clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid one-time supporter payment';
  END IF;
  -- Unlike a row lock, this also serializes two payments creating the first row.
  PERFORM pg_advisory_xact_lock(hashtext('supporter-one-time'), hashtext(target_user::text));
  SELECT user_id INTO receipt_user FROM private.stripe_one_time_payments WHERE payment_id = p_payment_id;
  IF FOUND THEN
    IF receipt_user <> target_user THEN
      RAISE EXCEPTION 'Stripe payment belongs to another supporter';
    END IF;
    SELECT * INTO fulfilled FROM public.supporters WHERE user_id = target_user;
    RETURN fulfilled;
  END IF;
  SELECT * INTO existing FROM public.supporters WHERE user_id = target_user FOR UPDATE;
  -- Also protect identity if different users race to redeem the same payment.
  INSERT INTO private.stripe_one_time_payments(payment_id, user_id, paid_at, amount_total)
    VALUES (p_payment_id, target_user, p_paid_at, amount) ON CONFLICT (payment_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT user_id INTO STRICT receipt_user FROM private.stripe_one_time_payments WHERE payment_id = p_payment_id;
    IF receipt_user <> target_user THEN
      RAISE EXCEPTION 'Stripe payment belongs to another supporter';
    END IF;
    SELECT * INTO fulfilled FROM public.supporters WHERE user_id = target_user;
    RETURN fulfilled;
  END IF;
  live_subscription := coalesce(existing.type = 'subscription'
    AND existing.status IN ('active', 'past_due') AND existing.stripe_subscription_id IS NOT NULL, false);
  -- A smaller contribution must not replace an already active paid tier.
  IF (live_subscription OR (existing.type = 'one_time' AND existing.status = 'active'
      AND (existing.expires_at IS NULL OR existing.expires_at > now())))
    AND array_position(ARRAY['supporter', 'scav', 'timmy', 'chad'], existing.tier)
      > array_position(ARRAY['supporter', 'scav', 'timmy', 'chad'], incoming_tier) THEN
    incoming_tier := existing.tier;
  END IF;
  IF live_subscription THEN
    expiry := existing.expires_at;
  ELSIF p_paid_at < timestamptz '2026-10-07 00:00:00+00'
    OR (existing.type = 'one_time' AND existing.status = 'active' AND existing.expires_at IS NULL) THEN
    expiry := NULL;
  ELSE
    expiry := greatest(now(), CASE WHEN existing.type = 'one_time' AND existing.status = 'active'
      THEN existing.expires_at END) + interval '30 days' * least(12, greatest(1, amount / 400));
  END IF;
  INSERT INTO public.supporters(user_id, tier, status, type, stripe_customer_id, stripe_subscription_id,
    has_ever_supported, retention_history_verified, last_contribution_at, discord_user_id,
    amount_total, started_at, expires_at, updated_at)
  VALUES (target_user, incoming_tier, CASE WHEN live_subscription THEN existing.status ELSE 'active' END,
    CASE WHEN live_subscription THEN 'subscription' ELSE 'one_time' END,
    coalesce(nullif(p_record->>'stripe_customer_id', ''), existing.stripe_customer_id),
    CASE WHEN live_subscription THEN existing.stripe_subscription_id END,
    true, true, greatest(existing.last_contribution_at, p_paid_at), p_record->>'discord_user_id',
    amount, coalesce(existing.started_at, (p_record->>'started_at')::timestamptz, now()), expiry, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier, status = EXCLUDED.status, type = EXCLUDED.type,
    stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    has_ever_supported = EXCLUDED.has_ever_supported, retention_history_verified = EXCLUDED.retention_history_verified,
    last_contribution_at = EXCLUDED.last_contribution_at, discord_user_id = EXCLUDED.discord_user_id,
    amount_total = EXCLUDED.amount_total, started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO fulfilled;
  RETURN fulfilled;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfill_one_time_supporter(text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_one_time_supporter(text, timestamptz, jsonb) TO service_role;
