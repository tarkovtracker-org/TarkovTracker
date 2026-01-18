-- Address security lints and tighten privileges

-- Ensure view uses invoker permissions to honor RLS on underlying tables
ALTER VIEW public.team_member_summary SET (security_invoker = true);

-- Restrict direct access to the summary view
REVOKE ALL ON public.team_member_summary FROM anon, authenticated;
GRANT SELECT ON public.team_member_summary TO authenticated;

-- Restrict audit log inserts to the service role
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.admin_audit_log;
CREATE POLICY "Service role can insert audit logs"
  ON public.admin_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT ON public.admin_audit_log FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;

-- Fix function search_path to prevent role-mutable lookup
ALTER FUNCTION public.cleanup_old_deletion_attempts(integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.sync_membership_game_mode()
  SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_deletion_attempts(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_deletion_attempts(integer)
  TO service_role;
