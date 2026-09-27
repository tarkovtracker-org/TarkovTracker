-- Browser roles use rows and RPCs, never table maintenance or DDL (#663).
-- Preserve existing row and column privileges and all service_role access.
-- The billing/audit migration separately removes their unnecessary row writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE
  public.user_progress,
  public.account_ip_audit,
  public.user_preferences,
  public.api_tokens,
  public.user_prestige_runs,
  public.user_system,
  public.team_events,
  public.discord_account_links,
  public.team_memberships,
  public.teams,
  public.account_deletion_jobs,
  public.supporters,
  public.admin_audit_log,
  public.stripe_events
  FROM PUBLIC, anon, authenticated;

COMMIT;
