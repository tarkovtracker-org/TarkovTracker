BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Billing identity outlives the single current entitlement slot and ordinary revocation.
CREATE TABLE public.account_billing_subscriptions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL,
  PRIMARY KEY (user_id, stripe_subscription_id)
);
ALTER TABLE public.account_billing_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_billing_subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.account_billing_subscriptions TO service_role;
CREATE FUNCTION private.retain_account_billing_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stripe_subscription_id IS NOT NULL THEN
    INSERT INTO public.account_billing_subscriptions VALUES (OLD.user_id, OLD.stripe_subscription_id) ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.stripe_subscription_id IS NOT NULL THEN
    INSERT INTO public.account_billing_subscriptions VALUES (NEW.user_id, NEW.stripe_subscription_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.retain_account_billing_subscription() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER retain_account_billing_subscription AFTER INSERT OR UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION private.retain_account_billing_subscription();

-- Every Auth deletion path, including the SQL retry/inactive workers, retains linked billing.
-- A local entitlement status is not proof of Stripe termination (disputes can revoke it early).
CREATE FUNCTION private.guard_account_deletion_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.supporters
    WHERE user_id = OLD.id
      AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL) FOR UPDATE;
  IF FOUND OR EXISTS (SELECT 1 FROM public.account_billing_subscriptions WHERE user_id = OLD.id) THEN
    RAISE EXCEPTION 'account_deletion_subscription_active' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_account_deletion_billing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_account_deletion_billing BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.guard_account_deletion_billing();

-- Serialize deletion claims with billing identity writes. A webhook that loses this race
-- retries; after deletion it compensates the orphaned subscription instead of granting access.
CREATE FUNCTION private.fence_account_deletion_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'account_deletion_jobs' THEN
    IF NEW.status = 'in_progress' THEN
      PERFORM 1 FROM auth.users WHERE id = NEW.user_id FOR UPDATE;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stripe_customer_id IS NULL AND NEW.stripe_subscription_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stripe_customer_id IS NOT DISTINCT FROM OLD.stripe_customer_id
       AND NEW.stripe_subscription_id IS NOT DISTINCT FROM OLD.stripe_subscription_id THEN RETURN NEW; END IF;
  END IF;
  PERFORM 1 FROM auth.users WHERE id = NEW.user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.account_deletion_jobs WHERE user_id = NEW.user_id
    AND status = 'in_progress' AND updated_at > clock_timestamp() - interval '15 minutes') THEN
    RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.fence_account_deletion_billing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fence_account_deletion_claim BEFORE INSERT OR UPDATE ON public.account_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION private.fence_account_deletion_billing();
CREATE TRIGGER fence_account_deletion_billing BEFORE INSERT OR UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION private.fence_account_deletion_billing();

-- Record signed subscription events even if they cannot replace the current entitlement.
CREATE FUNCTION private.record_account_billing_subscription(p_user_id uuid, p_subscription_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_subscription_id IS NULL OR p_subscription_id = '' THEN RAISE EXCEPTION 'Missing subscription identity'; END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.account_deletion_jobs WHERE user_id = p_user_id
    AND status = 'in_progress' AND updated_at > clock_timestamp() - interval '15 minutes') THEN
    RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.account_billing_subscriptions VALUES (p_user_id,p_subscription_id) ON CONFLICT DO NOTHING;
END;
$$;
CREATE FUNCTION public.record_account_billing_subscription(p_user_id uuid, p_subscription_id text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.record_account_billing_subscription(p_user_id,p_subscription_id);
$$;
REVOKE ALL ON FUNCTION private.record_account_billing_subscription(uuid,text), public.record_account_billing_subscription(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_account_billing_subscription(uuid,text), public.record_account_billing_subscription(uuid,text)
  TO service_role;

-- Only trusted server code calls this after Stripe returns a permanently terminal subscription.
-- Compare the complete verified identity after the claim closes concurrent billing writes.
CREATE FUNCTION private.clear_ended_deletion_subscription(
  p_user_id uuid, p_subscription_id text, p_customer_id text, p_claim_token uuid, p_subscription_ids text[]
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE billing public.supporters%ROWTYPE;
  linked_ids text[];
BEGIN
  PERFORM 1 FROM public.account_deletion_jobs
    WHERE user_id = p_user_id AND claim_token = p_claim_token AND status = 'in_progress'
      AND updated_at > clock_timestamp() - interval '15 minutes' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce(array_agg(stripe_subscription_id ORDER BY stripe_subscription_id), ARRAY[]::text[])
    INTO linked_ids FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
  IF linked_ids IS DISTINCT FROM ARRAY(SELECT unnest(p_subscription_ids) ORDER BY 1) THEN RETURN false; END IF;
  SELECT * INTO billing FROM public.supporters WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_subscription_id IS NOT NULL OR p_customer_id IS NOT NULL THEN RETURN false; END IF;
    DELETE FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  IF billing.stripe_subscription_id IS DISTINCT FROM p_subscription_id
     OR billing.stripe_customer_id IS DISTINCT FROM p_customer_id THEN RETURN false; END IF;
  UPDATE public.supporters SET stripe_subscription_id = NULL, stripe_customer_id = NULL WHERE user_id = p_user_id;
  DELETE FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
  RETURN true;
END;
$$;
CREATE FUNCTION public.clear_ended_deletion_subscription(
  p_user_id uuid, p_subscription_id text, p_customer_id text, p_claim_token uuid, p_subscription_ids text[]
) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.clear_ended_deletion_subscription(p_user_id, p_subscription_id, p_customer_id, p_claim_token, p_subscription_ids);
$$;
REVOKE ALL ON FUNCTION private.clear_ended_deletion_subscription(uuid, text, text, uuid, text[]),
  public.clear_ended_deletion_subscription(uuid, text, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.clear_ended_deletion_subscription(uuid, text, text, uuid, text[]),
  public.clear_ended_deletion_subscription(uuid, text, text, uuid, text[]) TO service_role;
COMMIT;
