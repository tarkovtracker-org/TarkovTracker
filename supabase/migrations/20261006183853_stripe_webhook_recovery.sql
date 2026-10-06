-- Existing receipts do not prove completion. The constant default preserves
-- that uncertainty without replaying or rewriting historical billing records.
ALTER TABLE public.stripe_events
  ADD COLUMN processing_state text NOT NULL DEFAULT 'legacy_unknown'
    CHECK (processing_state IN ('legacy_unknown', 'processing', 'retryable', 'completed', 'terminal')),
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0;

CREATE FUNCTION public.claim_stripe_event(p_event_id text, p_event_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  receipt public.stripe_events%ROWTYPE;
  token uuid := gen_random_uuid();
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Invalid Stripe event reference';
  END IF;
  INSERT INTO public.stripe_events(event_id, event_type, processing_state)
    VALUES (p_event_id, p_event_type, 'retryable') ON CONFLICT (event_id) DO NOTHING;
  SELECT * INTO STRICT receipt FROM public.stripe_events
    WHERE event_id = p_event_id FOR UPDATE;
  IF receipt.event_type <> p_event_type THEN
    RETURN jsonb_build_object('outcome', 'type_mismatch');
  END IF;
  IF receipt.processing_state IN ('legacy_unknown', 'completed', 'terminal') THEN
    RETURN jsonb_build_object('outcome', receipt.processing_state);
  END IF;
  IF receipt.processing_state = 'processing' AND receipt.lease_expires_at > clock_timestamp() THEN
    RETURN jsonb_build_object('outcome', 'in_progress');
  END IF;
  UPDATE public.stripe_events SET processing_state = 'processing', claim_token = token,
    lease_expires_at = clock_timestamp() + interval '5 minutes', attempts = attempts + 1
    WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', 'claimed', 'token', token);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role;

CREATE FUNCTION public.finish_stripe_event(p_event_id text, p_claim_token uuid, p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
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

-- PostgREST supplies the scoped client's headers to the entire transaction,
-- including nested SECURITY DEFINER disqualification calls. Acquire the event
-- lock BEFORE any billing row lock, and hold it until all effects commit.
-- Other billing/account tools without these headers retain their existing grants.
CREATE FUNCTION private.assert_stripe_event_claim()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  request_event_id text := headers->>'x-stripe-event-id';
  token text := headers->>'x-stripe-claim-token';
  receipt public.stripe_events%ROWTYPE;
BEGIN
  IF request_event_id IS NULL AND token IS NULL THEN RETURN; END IF;
  SELECT * INTO receipt FROM public.stripe_events
    WHERE stripe_events.event_id = request_event_id FOR UPDATE;
  IF NOT FOUND OR receipt.processing_state <> 'processing'
    OR receipt.claim_token::text IS DISTINCT FROM token
    OR receipt.lease_expires_at IS NULL OR receipt.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Stripe event claim is no longer current' USING ERRCODE = '40001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_stripe_event_claim() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION private.fence_stripe_event_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_stripe_event_claim();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.fence_stripe_event_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER fence_stripe_supporter_write BEFORE INSERT OR UPDATE OR DELETE ON public.supporters
  FOR EACH STATEMENT EXECUTE FUNCTION private.fence_stripe_event_write();
CREATE TRIGGER fence_stripe_chargeback_write BEFORE INSERT OR UPDATE OR DELETE ON private.supporter_chargebacks
  FOR EACH STATEMENT EXECUTE FUNCTION private.fence_stripe_event_write();

-- The existing RPC takes a customer advisory lock before its first write.
-- Fence at entry too, preserving event -> customer -> billing-row lock order.
CREATE OR REPLACE FUNCTION public.disqualify_supporter_customer(p_customer_id text, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_stripe_event_claim();
  IF p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 4 AND 128 THEN
    RAISE EXCEPTION 'Invalid Stripe customer reference';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext(p_customer_id));
  INSERT INTO private.supporter_chargebacks(customer_id, user_id)
    VALUES (p_customer_id, (SELECT id FROM auth.users WHERE id = p_user_id))
    ON CONFLICT (customer_id) DO UPDATE SET
      user_id = coalesce(supporter_chargebacks.user_id, EXCLUDED.user_id);
  UPDATE public.supporters SET supporter_disqualified_at =
    (SELECT disqualified_at FROM private.supporter_chargebacks WHERE customer_id = p_customer_id)
    WHERE stripe_customer_id = p_customer_id OR user_id = p_user_id;
END;
$$;

-- Never discard unresolved work merely because its first delivery is old.
SELECT cron.alter_job(jobid, command :=
  $$DELETE FROM public.stripe_events WHERE completed_at < NOW() - INTERVAL '30 days'
    AND processing_state IN ('completed', 'terminal')$$)
FROM cron.job WHERE jobname = 'stripe-events-cleanup';
