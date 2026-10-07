-- Explicit browser access for the 11 remaining tables audited in #663.
-- Server writes use service_role or existing SECURITY DEFINER RPCs/triggers.
-- See docs/systems/progress-storage.md for consumers and the access contract.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL ON TABLE
  public.user_progress, public.account_ip_audit, public.user_preferences,
  public.api_tokens, public.user_prestige_runs, public.user_system,
  public.team_events, public.discord_account_links, public.team_memberships,
  public.teams, public.account_deletion_jobs
  FROM PUBLIC, anon, authenticated;

-- Table revokes do not remove column-only privileges. Clear any historical
-- or drifted column grants before restoring the one supported column update.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname, string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) AS columns
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
        'user_progress', 'account_ip_audit', 'user_preferences', 'api_tokens',
        'user_prestige_runs', 'user_system', 'team_events', 'discord_account_links',
        'team_memberships', 'teams', 'account_deletion_jobs'
      ])
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      target.columns, target.relname);
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE
  public.user_progress, public.user_preferences, public.api_tokens,
  public.user_prestige_runs, public.user_system, public.team_events,
  public.discord_account_links, public.team_memberships, public.teams,
  public.account_deletion_jobs
  TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.user_preferences TO authenticated;
GRANT DELETE ON TABLE public.api_tokens, public.user_prestige_runs TO authenticated;
GRANT UPDATE (note) ON TABLE public.api_tokens TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_progress, public.account_ip_audit, public.user_preferences,
  public.api_tokens, public.user_prestige_runs, public.user_system,
  public.team_events, public.discord_account_links, public.team_memberships,
  public.teams, public.account_deletion_jobs
  TO service_role;

COMMIT;
