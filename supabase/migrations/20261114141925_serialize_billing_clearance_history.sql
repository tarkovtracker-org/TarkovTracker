BEGIN;
-- Keep signed subscription recording and clearance on the same Auth-user lock.
-- Read the complete history only after every potentially blocking row acquisition.
CREATE OR REPLACE FUNCTION private.clear_ended_deletion_subscription(
  p_user_id uuid, p_subscription_id text, p_customer_id text, p_claim_token uuid, p_subscription_ids text[]
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  billing public.supporters%ROWTYPE;
  has_billing boolean;
  linked_ids text[];
  claimed_at timestamptz;
BEGIN
  -- Claimants take this advisory lock before touching jobs/Auth; preserve that order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('account-deletion-job'), pg_catalog.hashtext(p_user_id::text));
  SELECT updated_at INTO claimed_at FROM public.account_deletion_jobs
    WHERE user_id = p_user_id AND claim_token = p_claim_token AND status = 'in_progress'
      AND updated_at > clock_timestamp() - interval '15 minutes' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO billing FROM public.supporters WHERE user_id = p_user_id FOR UPDATE;
  has_billing := FOUND;
  IF claimed_at <= clock_timestamp() - interval '15 minutes' THEN RETURN false; END IF;
  SELECT coalesce(array_agg(stripe_subscription_id ORDER BY stripe_subscription_id), ARRAY[]::text[])
    INTO linked_ids FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
  IF linked_ids IS DISTINCT FROM ARRAY(SELECT unnest(p_subscription_ids) ORDER BY 1) THEN RETURN false; END IF;
  IF NOT has_billing THEN
    IF p_subscription_id IS NOT NULL OR p_customer_id IS NOT NULL THEN RETURN false; END IF;
    DELETE FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
    IF claimed_at <= clock_timestamp() - interval '15 minutes' THEN
      RAISE EXCEPTION 'account_deletion_lease_expired' USING ERRCODE = '40001';
    END IF;
    RETURN true;
  END IF;
  IF billing.stripe_subscription_id IS DISTINCT FROM p_subscription_id
     OR billing.stripe_customer_id IS DISTINCT FROM p_customer_id THEN RETURN false; END IF;
  UPDATE public.supporters SET stripe_subscription_id = NULL, stripe_customer_id = NULL WHERE user_id = p_user_id;
  DELETE FROM public.account_billing_subscriptions WHERE user_id = p_user_id;
  -- Triggers/deletes can wait too. Raising rolls back every mutation in this call.
  IF claimed_at <= clock_timestamp() - interval '15 minutes' THEN
    RAISE EXCEPTION 'account_deletion_lease_expired' USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.clear_ended_deletion_subscription(uuid, text, text, uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.clear_ended_deletion_subscription(uuid, text, text, uuid, text[])
  TO service_role;
COMMIT;
