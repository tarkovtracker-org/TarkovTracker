-- Address Supabase performance advisories on supporters and stripe_events RLS:
-- - 0003 auth_rls_initplan: wrap auth.<fn>() in (select ...) so it is evaluated
--   once per query (initplan) instead of once per row.
-- - 0006 multiple_permissive_policies: the "Service role full access" policies
--   were FOR ALL with no role target, so they applied to anon/authenticated too
--   and stacked as a second permissive SELECT policy. service_role bypasses RLS
--   entirely, so scoping these policies TO service_role removes the redundant
--   overlap without changing access (service_role access is unaffected).

-- supporters
DROP POLICY IF EXISTS "Users can view own supporter row" ON public.supporters;
CREATE POLICY "Users can view own supporter row" ON public.supporters
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access" ON public.supporters;
CREATE POLICY "Service role full access" ON public.supporters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- stripe_events
DROP POLICY IF EXISTS "Service role full access" ON public.stripe_events;
CREATE POLICY "Service role full access" ON public.stripe_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
