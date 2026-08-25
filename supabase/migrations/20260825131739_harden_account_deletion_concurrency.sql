CREATE OR REPLACE FUNCTION public.consume_account_deletion_attempt(
  p_user_id UUID,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_oldest_attempt TIMESTAMPTZ;
  v_attempt_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('account-deletion-attempt'), hashtext(p_user_id::TEXT));
  v_now := clock_timestamp();

  SELECT COUNT(*), MIN(ada.attempted_at)
  INTO v_attempt_count, v_oldest_attempt
  FROM public.account_deletion_attempts AS ada
  WHERE ada.user_id = p_user_id
    AND ada.attempted_at >= v_now - INTERVAL '1 minute';

  IF v_attempt_count >= 3 THEN
    RETURN QUERY
    SELECT
      FALSE,
      GREATEST(CEIL(EXTRACT(EPOCH FROM (v_oldest_attempt + INTERVAL '1 minute' - v_now)))::INTEGER, 1);
    RETURN;
  END IF;

  INSERT INTO public.account_deletion_attempts (
    user_id,
    attempted_at,
    ip_address,
    user_agent
  )
  VALUES (
    p_user_id,
    v_now,
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT TRUE, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_account_deletion_attempt(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_account_deletion_attempt(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.consume_account_deletion_attempt(UUID, TEXT, TEXT) IS
  'Atomically enforces and records the three-per-minute account deletion attempt limit.';

CREATE OR REPLACE FUNCTION public.claim_account_deletion_job(
  p_user_id UUID,
  p_create_if_missing BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  claimed BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('account-deletion-job'), hashtext(p_user_id::TEXT));
  v_now := clock_timestamp();

  IF p_create_if_missing THEN
    INSERT INTO public.account_deletion_jobs (user_id, status, next_run_at, updated_at)
    VALUES (p_user_id, 'pending', v_now, v_now)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  UPDATE public.account_deletion_jobs AS adj
  SET status = 'in_progress',
      updated_at = v_now,
      next_run_at = NULL,
      last_error = NULL,
      last_error_details = NULL,
      last_error_at = NULL
  WHERE adj.user_id = p_user_id
    AND (
      (
        adj.status IN ('pending', 'failed')
        AND (adj.next_run_at IS NULL OR adj.next_run_at <= v_now)
      )
      OR (
        adj.status = 'in_progress'
        AND adj.updated_at <= v_now - INTERVAL '15 minutes'
      )
    )
  RETURNING TRUE, adj.status
  INTO claimed, status;

  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT FALSE, adj.status
  INTO claimed, status
  FROM public.account_deletion_jobs AS adj
  WHERE adj.user_id = p_user_id;

  IF FOUND THEN
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_deletion_job(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_job(UUID, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.claim_account_deletion_job(UUID, BOOLEAN) IS
  'Atomically claims a due account deletion job and recovers in-progress jobs after a 15-minute lease.';
