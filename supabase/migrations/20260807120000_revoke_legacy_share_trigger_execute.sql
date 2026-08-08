-- Address advisor lint 0028 anon_security_definer_function_executable for
-- public.sync_legacy_profile_share_visibility().
--
-- Supabase ships ALTER DEFAULT PRIVILEGES on schema public that grants EXECUTE
-- on new functions to anon, authenticated, and service_role. The creating
-- migration (20260804043342) only ran `REVOKE ALL ... FROM PUBLIC`, which drops
-- the implicit PUBLIC grant but leaves those explicit role grants in place, so
-- the function stayed callable by anon and authenticated via PostgREST.
--
-- Revoking is behavior-neutral: the AFTER UPDATE trigger on user_preferences
-- fires as the table owner regardless of the caller's EXECUTE privilege, and
-- nothing invokes this function directly.
--
-- The other SECURITY DEFINER functions here are intentional and left alone:
-- sync_user_game_mode_progress, set_game_mode_profile_visibility, and
-- archive_prestige_run_and_reset_progress are authenticated RPCs that validate
-- auth.uid() and pin search_path.
REVOKE EXECUTE ON FUNCTION public.sync_legacy_profile_share_visibility()
  FROM PUBLIC, anon, authenticated;
