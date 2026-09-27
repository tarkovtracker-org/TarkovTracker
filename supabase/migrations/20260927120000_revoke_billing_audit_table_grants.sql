-- Least-privilege table grants for billing and admin audit tables (#663).
--
-- Supabase's ALTER DEFAULT PRIVILEGES on schema public grants every table
-- privilege to anon and authenticated. These tables never revoked them, so RLS
-- was the only guard against client writes, and TRUNCATE is not subject to RLS.
--
-- Intended access after this migration:
--   stripe_events    service_role only (stripe-webhook Edge Function).
--   supporters       authenticated SELECT (useSupporter, own row via RLS);
--                    writes via service_role (stripe-webhook, discord-role-sync)
--                    and the SECURITY DEFINER delete_discord_account_link trigger.
--   admin_audit_log  authenticated SELECT (admin UI, admins via RLS); writes via
--                    service_role (admin-cache-purge, update_promoted_twitch_config).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL ON TABLE public.stripe_events, public.supporters, public.admin_audit_log
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.supporters, public.admin_audit_log TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.stripe_events, public.supporters, public.admin_audit_log
  TO service_role;

COMMIT;
