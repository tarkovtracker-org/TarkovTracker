-- Enforce a hard cap of 3 active API tokens per user account.
-- The UI previously relied on a client-side check only; this makes the
-- invariant server-side so token rotation cannot bypass it.

-- Preflight: revoke excess active tokens for accounts already above the cap.
-- We revoke the oldest tokens beyond the limit (lowest created_at) so the
-- most recently created tokens are preserved. This is a one-time
-- reconciliation; the trigger below prevents future violations.
WITH ranked AS (
  SELECT
    token_id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM public.api_tokens
  WHERE is_active = TRUE
)
UPDATE public.api_tokens t
SET is_active = FALSE
FROM ranked r
WHERE t.token_id = r.token_id
  AND r.rn > 3;

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

REVOKE ALL ON FUNCTION public.enforce_api_token_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_api_token_cap() TO service_role, authenticated;

-- Drop the old trigger if it exists from a partial prior migration attempt.
DROP TRIGGER IF EXISTS trg_enforce_api_token_cap ON public.api_tokens;

CREATE TRIGGER trg_enforce_api_token_cap
  BEFORE INSERT OR UPDATE OF is_active, user_id ON public.api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_api_token_cap();

COMMENT ON FUNCTION public.enforce_api_token_cap() IS
  'Enforces a maximum of 3 active API tokens per user account. Uses a transaction advisory lock to prevent concurrent-creation races.';
