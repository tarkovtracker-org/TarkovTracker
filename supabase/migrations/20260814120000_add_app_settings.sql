BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
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

COMMIT;
