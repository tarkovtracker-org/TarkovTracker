BEGIN;

REVOKE UPDATE ON TABLE public.api_tokens FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  update_columns text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
    INTO update_columns
  FROM pg_attribute
  WHERE attrelid = 'public.api_tokens'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  IF update_columns IS NULL THEN
    RAISE EXCEPTION 'No columns found for public.api_tokens';
  END IF;

  EXECUTE format(
    'REVOKE UPDATE (%s) ON public.api_tokens FROM PUBLIC, anon, authenticated',
    update_columns
  );
END;
$$;

GRANT UPDATE (note) ON TABLE public.api_tokens TO authenticated;

DROP POLICY IF EXISTS "Users can update own API tokens" ON public.api_tokens;

CREATE POLICY "Users can update own API tokens" ON public.api_tokens
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
