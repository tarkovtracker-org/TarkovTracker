-- Capture remote-only objects into migration history (drift fix).
--
-- `public.handle_new_user()` and the `on_auth_user_created` trigger on
-- `auth.users` were created directly on the hosted project (via the dashboard),
-- so they existed on production but in no migration. A fresh `supabase db reset`
-- therefore did not reproduce new-user provisioning. This migration captures the
-- exact remote definitions so every environment matches production.
--
-- Definitions dumped from the linked project (ref knptqelvsodccnoehmbj) on
-- 2026-06-29. Idempotent so it is safe to apply against the existing remote.
-- search_path is pinned to `pg_catalog, public` (the remote definition used
-- only `public`) to match the hardened helpers and close the role-mutable
-- search_path vector on this SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.user_system (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
