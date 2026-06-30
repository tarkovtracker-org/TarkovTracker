-- Address Supabase advisor lint 0008 rls_enabled_no_policy.
--
-- public.mutation_rate_limits has RLS enabled but no policies, which already
-- means deny-all for anon/authenticated (and their grants are revoked). Only
-- service_role touches it, via the SECURITY DEFINER consume_mutation_rate_limit
-- function, and service_role bypasses RLS. The table is intentionally not
-- client-accessible.
--
-- Add an explicit deny-all policy so the "RLS enabled, no policy" lint clears.
-- This documents intent and changes no behavior: the policy never grants access,
-- service_role still bypasses RLS, and anon/authenticated remain locked out.

DROP POLICY IF EXISTS "No direct access" ON public.mutation_rate_limits;
CREATE POLICY "No direct access"
  ON public.mutation_rate_limits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
