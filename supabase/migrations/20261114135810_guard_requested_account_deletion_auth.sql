-- User-requested deletion requires a recent verified OAuth event and a live matching session.
-- The Edge Function supplies these values from getClaims, never from the request body.
CREATE FUNCTION private.claim_requested_account_deletion_job(
  p_user_id uuid, p_session_id uuid, p_authenticated_at timestamptz
)
RETURNS TABLE (claimed boolean, status text, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_not_after timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_authenticated_at IS NULL THEN
    RAISE EXCEPTION 'account_deletion_recent_login_required' USING ERRCODE = '28000';
  END IF;
  -- Match the existing claimant's lock order before pinning the Auth user/session.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('account-deletion-job'), pg_catalog.hashtext(p_user_id::text));
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_deletion_recent_login_required' USING ERRCODE = '28000';
  END IF;
  SELECT not_after INTO v_not_after FROM auth.sessions
    WHERE id = p_session_id AND user_id = p_user_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_deletion_recent_login_required' USING ERRCODE = '28000';
  END IF;
  -- Use current database time after lock waits; refreshed JWT iat does not extend this window.
  IF p_authenticated_at < clock_timestamp() - interval '5 minutes'
    OR p_authenticated_at > clock_timestamp() + interval '30 seconds'
    OR (v_not_after IS NOT NULL AND v_not_after <= clock_timestamp()) THEN
    RAISE EXCEPTION 'account_deletion_recent_login_required' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY SELECT * FROM public.claim_account_deletion_job(p_user_id, true);
END;
$$;
REVOKE ALL ON FUNCTION private.claim_requested_account_deletion_job(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_requested_account_deletion_job(uuid, uuid, timestamptz)
  TO service_role;

CREATE FUNCTION public.claim_requested_account_deletion_job(
  p_user_id uuid, p_session_id uuid, p_authenticated_at timestamptz
)
RETURNS TABLE (claimed boolean, status text, claim_token uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM private.claim_requested_account_deletion_job(
    p_user_id, p_session_id, p_authenticated_at);
$$;
REVOKE ALL ON FUNCTION public.claim_requested_account_deletion_job(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_requested_account_deletion_job(uuid, uuid, timestamptz)
  TO service_role;
COMMENT ON FUNCTION public.claim_requested_account_deletion_job(uuid, uuid, timestamptz) IS
  'Claims an explicit user deletion request after verifying recent OAuth proof and a live session; trusted retries retain their existing claim path.';
