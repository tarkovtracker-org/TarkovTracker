-- Enforce a hard cap of 3 active API tokens per user account.
-- The UI previously relied on a client-side check only; this makes the
-- invariant server-side so token rotation cannot bypass it.

-- Preflight: revoke excess active tokens for accounts already above the cap.
-- We revoke the oldest tokens beyond the limit (lowest created_at) so the
-- most recently created tokens are preserved. NULLS LAST ensures tokens
-- with unknown creation dates are treated as oldest (not newest, which is
-- the PostgreSQL DESC default of NULLS FIRST), so a genuinely newer dated
-- token is never revoked in favor of an undated one. token_id DESC is a
-- deterministic tiebreaker for rows sharing a created_at timestamp.
-- This is a one-time reconciliation; the trigger below prevents future
-- violations.
BEGIN;
LOCK TABLE public.api_tokens IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT
    token_id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC NULLS LAST, token_id DESC) AS rn
  FROM public.api_tokens
  WHERE is_active = TRUE
)
UPDATE public.api_tokens t
SET is_active = FALSE
FROM ranked r
WHERE t.token_id = r.token_id
  AND r.rn > 3;
COMMIT;

CREATE OR REPLACE FUNCTION public.enforce_api_token_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_target_user UUID;
BEGIN
  -- Determine the user_id whose active-token count must be checked.
  -- On UPDATE that changes user_id, the destination account is the one
  -- that could exceed the cap.
  v_target_user := NEW.user_id;

  IF NEW.is_active = TRUE THEN
    -- Serialize per-user token creation to prevent concurrent inserts from
    -- both passing the count check. Uses a transaction-scoped advisory lock
    -- keyed on the user_id's text representation.
    PERFORM pg_advisory_xact_lock(hashtext(v_target_user::text));

    SELECT COUNT(*) INTO v_active_count
    FROM public.api_tokens
    WHERE user_id = v_target_user
      AND is_active = TRUE
      AND token_id <> NEW.token_id;

    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Token limit reached (3 active)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions fire as the table owner; callers do not need EXECUTE.
-- Matches revoke_only posture from 20260629120000 (no authenticated EXECUTE
-- on SECURITY DEFINER trigger helpers).
REVOKE ALL ON FUNCTION public.enforce_api_token_cap() FROM PUBLIC, anon, authenticated;

-- Drop the old trigger if it exists from a partial prior migration attempt.
DROP TRIGGER IF EXISTS trg_enforce_api_token_cap ON public.api_tokens;

CREATE TRIGGER trg_enforce_api_token_cap
  BEFORE INSERT OR UPDATE OF is_active, user_id ON public.api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_api_token_cap();

COMMENT ON FUNCTION public.enforce_api_token_cap() IS
  'Enforces a maximum of 3 active API tokens per user account. Uses a transaction advisory lock to prevent concurrent-creation races.';

-- Force all token creation through the token-create Edge Function so the
-- 3/hour per-account mutation rate limit cannot be bypassed via PostgREST
-- inserts under the authenticated role. service_role (used by token-create)
-- retains INSERT. Authenticated users keep SELECT/UPDATE/DELETE for list
-- and soft-management; revoke still goes through token-revoke (service role)
-- or direct DELETE under the remaining privilege.
REVOKE INSERT ON public.api_tokens FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Users can create own API tokens" ON public.api_tokens;
