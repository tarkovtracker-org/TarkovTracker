-- Advisor cleanup. Every statement is metadata-only; no row is read or rewritten.
--
-- 1. Lint 0008 rls_enabled_no_policy on api_usage_daily. RLS is enabled with no
--    policies and anon/authenticated have no table grants, so access is already
--    denied twice over. Only service_role touches the table, via the SECURITY
--    DEFINER record_api_usage/get_api_usage_summary functions, and service_role
--    bypasses RLS. The explicit deny-all policy documents intent and clears the
--    lint without changing behavior. Mirrors 20260630120000 for
--    mutation_rate_limits.
DROP POLICY IF EXISTS "No direct access" ON public.api_usage_daily;
CREATE POLICY "No direct access"
  ON public.api_usage_daily
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2. Lint 0005 unused_index, limited to indexes with a proven replacement.
--
--    idx_team_memberships_user_id (0 scans) is a strict prefix of
--    team_memberships_user_mode_unique on (user_id, game_mode), which serves
--    every user_id lookup. idx_team_memberships_team_id is deliberately kept:
--    it is the hottest index on the table.
--
--    idx_api_usage_daily_user_agent (0 scans) is a partial index created
--    out-of-band; no migration defines it. User-agent values are read as
--    attributes of a token/day row, never used as a search key.
DROP INDEX IF EXISTS public.idx_team_memberships_user_id;
DROP INDEX IF EXISTS public.idx_api_usage_daily_user_agent;

-- 3. Autovacuum thresholds for the high-churn progress tables. Both sit just
--    below the default trigger point (dead tuples vs 50 + 0.2 * live), so the
--    main heaps had never been autovacuumed despite ~18% dead tuples. Lowering
--    the scale factor makes vacuum run regularly, which keeps the visibility map
--    and index health from degrading.
--
--    The toast.* settings matter more than the heap ones here: these tables are
--    ~96% TOAST (user_progress is 15 MB heap / 432 MB TOAST) because every
--    progress write rewrites a multi-kilobyte JSONB payload. This bounds TOAST
--    growth going forward; it does not shrink the existing relation. Reclaiming
--    that space requires retiring the legacy pvp_data/pve_data payload, not
--    VACUUM FULL.
--
--    ALTER TABLE ... SET (storage parameters) takes SHARE UPDATE EXCLUSIVE,
--    which does not block concurrent reads or writes.
ALTER TABLE public.user_progress SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  toast.autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.user_game_mode_progress SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  toast.autovacuum_vacuum_scale_factor = 0.05
);
