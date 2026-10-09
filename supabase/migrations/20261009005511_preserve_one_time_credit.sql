BEGIN;
ALTER TABLE public.supporters
  ADD COLUMN one_time_tier text CHECK (one_time_tier IN ('supporter','scav','timmy','chad')),
  ADD COLUMN one_time_expires_at timestamptz,
  ADD COLUMN one_time_remaining interval,
  ADD COLUMN one_time_remaining_seconds double precision GENERATED ALWAYS AS (extract(epoch FROM one_time_remaining)) STORED,
  ADD COLUMN one_time_legacy_unlimited boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT one_time_credit_shape CHECK (one_time_tier IS NOT NULL OR (one_time_expires_at IS NULL AND one_time_remaining IS NULL)),
  ADD CONSTRAINT one_time_credit_balance CHECK (one_time_remaining IS NULL OR
    (one_time_expires_at IS NULL AND one_time_remaining > interval '0' AND isfinite(one_time_remaining))),
  ADD CONSTRAINT one_time_credit_finite CHECK (one_time_expires_at IS NULL OR isfinite(one_time_expires_at));
COMMENT ON COLUMN public.supporters.one_time_tier IS 'Independent one-time entitlement; NULL means no credit.';
COMMENT ON COLUMN public.supporters.one_time_expires_at IS 'Running credit expiry; NULL while paused or unlimited.';

COMMENT ON COLUMN public.supporters.one_time_remaining IS 'Unused purchased time paused during subscription access; NULL with no expiry means unlimited.';

CREATE SEQUENCE private.stripe_one_time_credit_order;
REVOKE ALL ON SEQUENCE private.stripe_one_time_credit_order FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE private.stripe_one_time_credit_order TO service_role;
ALTER TABLE private.stripe_one_time_payments
  ADD COLUMN credit_order bigint,
  ADD COLUMN credit_tier text,
  ADD COLUMN banked_duration interval,
  ADD COLUMN refunded_at timestamptz;
ALTER TABLE private.stripe_one_time_payments ALTER COLUMN credit_order SET DEFAULT nextval('private.stripe_one_time_credit_order');
GRANT UPDATE (credit_tier, banked_duration, refunded_at) ON private.stripe_one_time_payments TO service_role;

-- Derive the effective row under its existing row lock, including old-handler writes.
-- Reads keep using tier/status/type/expires_at; no bulk historical rewrite is needed.
CREATE FUNCTION private.preserve_one_time_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  subscription_access boolean;
  resume_at timestamptz;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
BEGIN
  -- During the schema/function deployment gap, old handlers retry instead of
  -- revoking restored roles or leaving a refunded balance behind.
  IF headers->>'x-stripe-event-id' IS NOT NULL
    AND headers->>'x-supporter-credit-version' IS DISTINCT FROM '1'
    AND (NEW.one_time_tier IS NOT NULL OR (TG_OP = 'UPDATE' AND
      (OLD.one_time_tier IS NOT NULL OR (OLD.type = 'one_time' AND OLD.status = 'active' AND OLD.has_ever_supported)))) THEN
    RAISE EXCEPTION 'Supporter credit requires updated webhook' USING ERRCODE = '40001';
  END IF;
  IF NOT NEW.has_ever_supported OR NEW.supporter_disqualified_at IS NOT NULL
    OR (NEW.type = 'one_time' AND NEW.status <> 'active') THEN
    NEW.one_time_tier := NULL;
    NEW.one_time_expires_at := NULL;
    NEW.one_time_remaining := NULL;
    NEW.one_time_legacy_unlimited := false;
    RETURN NEW;
  END IF;
  subscription_access := NEW.type = 'subscription' AND NEW.status IN ('active','past_due')
    AND (NEW.expires_at > now() OR (NEW.status = 'active' AND NEW.expires_at IS NULL));
  IF TG_OP = 'UPDATE' AND subscription_access AND NEW.one_time_tier IS NULL
    AND OLD.type = 'one_time' AND OLD.status = 'active' THEN
    NEW.one_time_tier := OLD.tier;
    NEW.one_time_expires_at := OLD.expires_at;
    NEW.one_time_legacy_unlimited := OLD.expires_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM private.stripe_one_time_payments WHERE user_id = NEW.user_id
        AND paid_at < timestamptz '2026-10-07 00:00:00+00' AND refunded_at IS NULL);
  END IF;
  IF NEW.type = 'one_time' AND NEW.status = 'active' THEN
    NEW.one_time_tier := NEW.tier;
    NEW.one_time_expires_at := NEW.expires_at;
    NEW.one_time_remaining := NULL;
  END IF;
  IF subscription_access AND NEW.one_time_expires_at IS NOT NULL THEN
    IF NEW.one_time_expires_at > now() THEN
      NEW.one_time_remaining := NEW.one_time_expires_at - now();
      -- Finite credit started with the durable payment ledger; allocate the
      -- unspent tail to receipts, newest first, so a refund removes only its days.
      WITH allocations AS (
        SELECT payment_id, interval '30 days' * least(12, greatest(1, amount_total / 400)) AS duration,
          coalesce(sum(interval '30 days' * least(12, greatest(1, amount_total / 400))) OVER (
            ORDER BY credit_order DESC NULLS LAST, fulfilled_at DESC, payment_id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
            interval '0') AS newer
        FROM private.stripe_one_time_payments
        WHERE user_id = NEW.user_id AND paid_at >= timestamptz '2026-10-07 00:00:00+00' AND refunded_at IS NULL
      )
      UPDATE private.stripe_one_time_payments p SET
        banked_duration = greatest(interval '0', least(a.duration, NEW.one_time_remaining - a.newer)),
        credit_tier = coalesce(p.credit_tier, NEW.one_time_tier)
      FROM allocations a WHERE p.payment_id = a.payment_id;
    ELSE
      NEW.one_time_tier := NULL;
      NEW.one_time_remaining := NULL;
    END IF;
    NEW.one_time_expires_at := NULL;
  END IF;
  IF NEW.type = 'subscription' AND NOT subscription_access AND NEW.one_time_tier IS NOT NULL THEN
    resume_at := CASE WHEN NEW.status IN ('active','past_due') THEN NEW.expires_at
      ELSE coalesce(NEW.subscription_ended_at, NEW.expires_at, now()) END;
    IF NEW.one_time_remaining IS NOT NULL THEN
      NEW.one_time_expires_at := resume_at + NEW.one_time_remaining;
      NEW.one_time_remaining := NULL;
    END IF;
    IF NEW.one_time_expires_at IS NULL OR NEW.one_time_expires_at > now() THEN
      NEW.type := 'one_time';
      NEW.status := 'active';
      NEW.tier := NEW.one_time_tier;
      NEW.expires_at := NEW.one_time_expires_at;
      NEW.stripe_subscription_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.preserve_one_time_credit() FROM PUBLIC, anon, authenticated, service_role;
-- Run after retention denial so credit cannot resurrect a chargeback.
CREATE TRIGGER zz_preserve_one_time_credit BEFORE INSERT OR UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION private.preserve_one_time_credit();

CREATE OR REPLACE FUNCTION public.fulfill_one_time_supporter(p_payment_id text, p_paid_at timestamptz, p_record jsonb)
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
  expected_customer text;
  customer text;
  credit_tier text;
  credit_expiry timestamptz;
  credit_remaining interval;
BEGIN
  -- Always event -> user -> customer -> supporter: stale claims fail before any billing lock.
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
  SELECT stripe_customer_id INTO expected_customer FROM public.supporters WHERE user_id = target_user;
  -- Chargebacks take the customer lock before updating supporters. Lock both
  -- the current and incoming customer in deterministic order before the row.
  FOR customer IN SELECT DISTINCT value FROM unnest(ARRAY[
      expected_customer, nullif(p_record->>'stripe_customer_id', '')]) AS customers(value)
      WHERE value IS NOT NULL ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext(customer));
  END LOOP;
  SELECT * INTO existing FROM public.supporters WHERE user_id = target_user FOR UPDATE;
  IF existing.stripe_customer_id IS DISTINCT FROM expected_customer THEN
    RAISE EXCEPTION 'Supporter customer changed during fulfillment' USING ERRCODE = '40001';
  END IF;
  -- Also protect identity if different users race to redeem the same payment.
  INSERT INTO private.stripe_one_time_payments(payment_id, user_id, paid_at, amount_total, credit_tier, banked_duration)
    VALUES (p_payment_id, target_user, p_paid_at, amount, incoming_tier,
      CASE WHEN existing.type = 'subscription' AND existing.status IN ('active','past_due')
        AND (existing.expires_at > now() OR (existing.status = 'active' AND existing.expires_at IS NULL))
        AND p_paid_at >= timestamptz '2026-10-07 00:00:00+00'
      THEN interval '30 days' * least(12, greatest(1, amount / 400)) END) ON CONFLICT (payment_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT user_id INTO STRICT receipt_user FROM private.stripe_one_time_payments WHERE payment_id = p_payment_id;
    IF receipt_user <> target_user THEN
      RAISE EXCEPTION 'Stripe payment belongs to another supporter';
    END IF;
    SELECT * INTO fulfilled FROM public.supporters WHERE user_id = target_user;
    RETURN fulfilled;
  END IF;
  PERFORM set_config('stripe.one_time_payment_id', p_payment_id, true);
  live_subscription := coalesce(existing.type = 'subscription'
    AND existing.status IN ('active', 'past_due') AND existing.stripe_subscription_id IS NOT NULL
    AND (existing.expires_at > now() OR (existing.status = 'active' AND existing.expires_at IS NULL)), false);
  -- NULL tier means no credit; a present tier with neither expiry nor balance means unlimited.
  credit_tier := existing.one_time_tier;
  credit_expiry := existing.one_time_expires_at;
  credit_remaining := existing.one_time_remaining;
  IF credit_remaining IS NOT NULL AND NOT live_subscription THEN
    credit_expiry := (CASE WHEN existing.status IN ('active','past_due') THEN existing.expires_at
      ELSE coalesce(existing.subscription_ended_at, existing.expires_at, now()) END) + credit_remaining;
    credit_remaining := NULL;
  END IF;
  IF credit_tier IS NULL AND existing.type = 'one_time' AND existing.status = 'active'
    AND existing.has_ever_supported THEN
    credit_tier := existing.tier;
    credit_expiry := existing.expires_at;
  END IF;
  IF credit_tier IS NOT NULL AND (credit_expiry IS NULL OR credit_expiry > now()) THEN
    IF array_position(ARRAY['supporter','scav','timmy','chad'], credit_tier)
      > array_position(ARRAY['supporter','scav','timmy','chad'], incoming_tier) THEN
      incoming_tier := credit_tier;
    END IF;
  ELSE
    credit_tier := NULL;
    credit_expiry := NULL;
    credit_remaining := NULL;
  END IF;
  IF p_paid_at < timestamptz '2026-10-07 00:00:00+00'
    OR (credit_tier IS NOT NULL AND credit_expiry IS NULL AND credit_remaining IS NULL) THEN
    credit_expiry := NULL;
    credit_remaining := NULL;
  ELSIF live_subscription THEN
    credit_remaining := coalesce(credit_remaining, greatest(interval '0', credit_expiry - now()))
      + interval '30 days' * least(12, greatest(1, amount / 400));
    credit_expiry := NULL;
  ELSE
    credit_expiry := greatest(now(), credit_expiry)
      + interval '30 days' * least(12, greatest(1, amount / 400));
  END IF;
  credit_tier := incoming_tier;
  expiry := credit_expiry;
  IF live_subscription THEN
    expiry := existing.expires_at;
    IF array_position(ARRAY['supporter','scav','timmy','chad'], existing.tier)
      > array_position(ARRAY['supporter','scav','timmy','chad'], incoming_tier) THEN
      incoming_tier := existing.tier;
    END IF;
  END IF;
  INSERT INTO public.supporters(user_id, tier, status, type, stripe_customer_id, stripe_subscription_id,
    has_ever_supported, retention_history_verified, last_contribution_at, discord_user_id,
    amount_total, started_at, expires_at, updated_at, one_time_tier, one_time_expires_at, one_time_remaining)
  VALUES (target_user, incoming_tier, CASE WHEN live_subscription THEN existing.status ELSE 'active' END,
    CASE WHEN live_subscription THEN 'subscription' ELSE 'one_time' END,
    coalesce(nullif(p_record->>'stripe_customer_id', ''), existing.stripe_customer_id),
    CASE WHEN live_subscription THEN existing.stripe_subscription_id END,
    true, true, greatest(existing.last_contribution_at, p_paid_at), p_record->>'discord_user_id',
    amount, coalesce(existing.started_at, (p_record->>'started_at')::timestamptz, now()), expiry, now(), credit_tier, credit_expiry, credit_remaining)
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier, status = EXCLUDED.status, type = EXCLUDED.type,
    stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    has_ever_supported = EXCLUDED.has_ever_supported, retention_history_verified = EXCLUDED.retention_history_verified,
    last_contribution_at = EXCLUDED.last_contribution_at, discord_user_id = EXCLUDED.discord_user_id,
    amount_total = EXCLUDED.amount_total, started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at,
    updated_at = EXCLUDED.updated_at,
    one_time_tier = EXCLUDED.one_time_tier, one_time_expires_at = EXCLUDED.one_time_expires_at,
    one_time_remaining = EXCLUDED.one_time_remaining
  RETURNING * INTO fulfilled;
  RETURN fulfilled;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfill_one_time_supporter(text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_one_time_supporter(text, timestamptz, jsonb) TO service_role;

-- Refund receipts also fence a refund that arrives before checkout fulfillment.
CREATE FUNCTION public.refund_one_time_supporter(p_payment_id text, p_user_id uuid,
  p_paid_at timestamptz, p_amount integer)
RETURNS public.supporters LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  existing public.supporters%ROWTYPE;
  receipt private.stripe_one_time_payments%ROWTYPE;
  expected_customer text;
  credit_tier text;
  remaining interval;
BEGIN
  PERFORM private.assert_one_time_stripe_event_claim();
  IF p_payment_id IS NULL OR p_payment_id !~ '^pi_[A-Za-z0-9_]+$' OR length(p_payment_id) > 255
    OR p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR p_paid_at IS NULL OR NOT isfinite(p_paid_at) OR p_paid_at > clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid refunded one-time payment';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supporter-one-time'), hashtext(p_user_id::text));
  SELECT stripe_customer_id INTO expected_customer FROM public.supporters WHERE user_id = p_user_id;
  IF expected_customer IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext(expected_customer));
  END IF;
  SELECT * INTO STRICT existing FROM public.supporters WHERE user_id = p_user_id FOR UPDATE;
  IF existing.stripe_customer_id IS DISTINCT FROM expected_customer THEN
    RAISE EXCEPTION 'Supporter customer changed during refund' USING ERRCODE = '40001';
  END IF;
  INSERT INTO private.stripe_one_time_payments(payment_id,user_id,paid_at,amount_total,refunded_at)
    VALUES (p_payment_id,p_user_id,p_paid_at,p_amount,now()) ON CONFLICT (payment_id) DO NOTHING;
  IF FOUND THEN RETURN existing; END IF;
  SELECT * INTO STRICT receipt FROM private.stripe_one_time_payments WHERE payment_id = p_payment_id FOR UPDATE;
  IF receipt.user_id <> p_user_id THEN RAISE EXCEPTION 'Stripe payment belongs to another supporter'; END IF;
  IF receipt.refunded_at IS NOT NULL THEN RETURN existing; END IF;
  UPDATE private.stripe_one_time_payments SET refunded_at = now(), banked_duration = interval '0'
    WHERE payment_id = p_payment_id;
  IF existing.type <> 'subscription' OR existing.one_time_tier IS NULL THEN RETURN existing; END IF;
  remaining := greatest(interval '0', existing.one_time_remaining - coalesce(receipt.banked_duration, interval '0'));
  IF existing.one_time_remaining IS NULL AND NOT existing.one_time_legacy_unlimited
    AND receipt.paid_at < timestamptz '2026-10-07 00:00:00+00'
    AND NOT EXISTS (SELECT 1 FROM private.stripe_one_time_payments WHERE user_id = p_user_id
      AND paid_at < timestamptz '2026-10-07 00:00:00+00' AND refunded_at IS NULL) THEN
    SELECT coalesce(sum(banked_duration),interval '0') INTO remaining
      FROM private.stripe_one_time_payments WHERE user_id = p_user_id AND refunded_at IS NULL;
  ELSIF existing.one_time_remaining IS NULL THEN
    IF existing.one_time_legacy_unlimited THEN RETURN existing; END IF;
    SELECT p.credit_tier INTO credit_tier FROM private.stripe_one_time_payments p
      WHERE p.user_id = p_user_id AND p.refunded_at IS NULL
        AND (p.banked_duration > interval '0' OR p.paid_at < timestamptz '2026-10-07 00:00:00+00')
      ORDER BY array_position(ARRAY['supporter','scav','timmy','chad'],p.credit_tier) DESC NULLS LAST LIMIT 1;
    UPDATE public.supporters SET one_time_tier = coalesce(credit_tier,existing.one_time_tier),
      updated_at = now() WHERE user_id = p_user_id RETURNING * INTO existing;
    RETURN existing;
  END IF;
  SELECT p.credit_tier INTO credit_tier FROM private.stripe_one_time_payments p
    WHERE p.user_id = p_user_id AND p.refunded_at IS NULL AND p.banked_duration > interval '0'
    ORDER BY array_position(ARRAY['supporter','scav','timmy','chad'],p.credit_tier) DESC LIMIT 1;
  UPDATE public.supporters SET one_time_remaining = nullif(remaining,interval '0'),
    one_time_tier = CASE WHEN remaining > interval '0' THEN coalesce(credit_tier,existing.one_time_tier) END,
    one_time_expires_at = NULL, updated_at = now() WHERE user_id = p_user_id RETURNING * INTO existing;
  RETURN existing;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_one_time_supporter(text,uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_one_time_supporter(text,uuid,timestamptz,integer) TO service_role;

-- Read-time projection resumes expired grace even when Stripe sends no more events.
-- Invoker security preserves the underlying supporter RLS for browser reads.
CREATE VIEW public.supporter_entitlements WITH (security_invoker = true) AS
SELECT effective.* FROM public.supporters s CROSS JOIN LATERAL jsonb_populate_record(
  NULL::public.supporters, to_jsonb(s) || CASE WHEN
    s.type = 'subscription' AND s.status IN ('active','past_due')
    AND s.expires_at IS NOT NULL AND s.expires_at <= now()
    AND s.one_time_tier IS NOT NULL AND s.has_ever_supported AND s.supporter_disqualified_at IS NULL
    AND (s.one_time_remaining IS NULL OR s.expires_at + s.one_time_remaining > now())
  THEN jsonb_build_object('tier',s.one_time_tier,'type','one_time','status','active',
    'expires_at', CASE WHEN s.one_time_remaining IS NOT NULL THEN s.expires_at + s.one_time_remaining END)
  ELSE '{}'::jsonb END
) effective;
GRANT SELECT ON public.supporter_entitlements TO authenticated, service_role;
REVOKE ALL ON public.supporter_entitlements FROM PUBLIC, anon;

-- Old handlers must not acknowledge a read-only skipped refund during rollout.
CREATE OR REPLACE FUNCTION public.finish_stripe_event(p_event_id text, p_claim_token uuid, p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_outcome = 'completed' AND
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-supporter-credit-version' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Stripe completion requires updated webhook' USING ERRCODE = '40001';
  END IF;
  IF p_outcome NOT IN ('completed', 'retryable', 'terminal') OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'Invalid Stripe event outcome';
  END IF;
  UPDATE public.stripe_events SET processing_state = p_outcome,
    completed_at = CASE WHEN p_outcome IN ('completed', 'terminal') THEN clock_timestamp() END,
    lease_expires_at = NULL, claim_token = NULL
    WHERE event_id = p_event_id AND claim_token = p_claim_token
      AND processing_state = 'processing' AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_stripe_event(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_stripe_event(text, uuid, text) TO service_role;

COMMIT;
