BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE ALL ON TABLE public.app_settings FROM authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

-- Address Supabase advisor lint 0008 rls_enabled_no_policy. RLS is enabled with
-- no policies and anon/authenticated have no table grants, so access is already
-- denied twice over. Only service_role touches the table, through the Nitro
-- admin/public routes, and service_role bypasses RLS. The explicit deny-all
-- policy documents intent and clears the lint without changing behavior.
-- Mirrors 20260630120000 for mutation_rate_limits.
DROP POLICY IF EXISTS "No direct access" ON public.app_settings;
CREATE POLICY "No direct access"
  ON public.app_settings
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.update_promoted_twitch_config(
  p_value JSONB,
  p_admin_user_id UUID,
  p_admin_email TEXT
)
RETURNS TABLE(value JSONB, version BIGINT)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.app_settings AS settings (key, value, version, updated_at, updated_by)
  VALUES ('promoted_twitch', p_value, 1, NOW(), p_admin_user_id)
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      version = settings.version + 1,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by
  RETURNING settings.value, settings.version;

  INSERT INTO public.admin_audit_log (action, admin_user_id, details)
  VALUES (
    'twitch_config_update',
    p_admin_user_id,
    jsonb_build_object('adminEmail', p_admin_email) || p_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_promoted_twitch_config(JSONB, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_promoted_twitch_config(JSONB, UUID, TEXT) TO service_role;

COMMIT;
