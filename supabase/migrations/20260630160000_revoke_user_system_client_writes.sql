-- Least-privilege hardening for public.user_system.
--
-- Background: 20260213090000 granted authenticated INSERT/UPDATE on every column
-- except is_admin, on the assumption clients might write user_system directly.
-- They do not: every user_system write goes through edge functions using the
-- service_role client (team-create, team-join, team-leave, account-delete*),
-- and service_role bypasses column grants entirely. The app only ever reads
-- user_system (realtime subscription in useSystemStore + admin SELECT).
--
-- The leftover authenticated write grants are therefore unused attack surface:
-- they let a user rewrite server-owned columns on their own row (created_at,
-- updated_at), scoped to self by RLS but still undesirable. Revoke all
-- authenticated/anon INSERT/UPDATE on user_system; SELECT is unaffected.

REVOKE INSERT, UPDATE ON public.user_system FROM anon, authenticated;
