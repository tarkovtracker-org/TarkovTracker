-- Enforce a hard cap of 3 active API tokens per user account.
-- The UI previously relied on a client-side check only; this makes the
-- invariant server-side so token rotation cannot bypass it.

CREATE OR REPLACE FUNCTION public.enforce_api_token_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
BEGIN
  IF NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO v_active_count
    FROM public.api_tokens
    WHERE user_id = NEW.user_id
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

CREATE TRIGGER trg_enforce_api_token_cap
  BEFORE INSERT OR UPDATE OF is_active ON public.api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_api_token_cap();

COMMENT ON FUNCTION public.enforce_api_token_cap() IS
  'Enforces a maximum of 3 active API tokens per user account.';
