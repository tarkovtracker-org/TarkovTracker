ALTER TABLE public.user_progress
  VALIDATE CONSTRAINT user_progress_current_game_mode_check;
ALTER TABLE public.teams
  VALIDATE CONSTRAINT teams_game_mode_check;
ALTER TABLE public.team_memberships
  VALIDATE CONSTRAINT team_memberships_game_mode_check;
ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_game_mode_check;
-- One-way cleanup of legacy pre-scheme tokens (e.g. tt_...) that predate the PVP_/PVE_/SZN_
-- prefix convention, so api_tokens_token_value_game_mode_match can be validated. These tokens
-- are already unusable: the API gateway rejects any token whose prefix is not PVP_/PVE_/SZN_
-- (see workers/api-gateway/src/auth.ts), so this only reconciles stored state with the gateway's
-- behavior. token_value is cleared irreversibly; affected users must re-issue tokens.
UPDATE public.api_tokens
SET token_value = NULL,
    is_active = FALSE
WHERE token_value IS NOT NULL
  AND token_value NOT LIKE (CASE game_mode
    WHEN 'pvp' THEN 'PVP\_%'
    WHEN 'pve' THEN 'PVE\_%'
    WHEN 'seasonal' THEN 'SZN\_%'
  END) ESCAPE '\';
ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_token_value_game_mode_match;
ALTER TABLE public.user_system
  VALIDATE CONSTRAINT user_system_seasonal_team_id_fkey;
ALTER TABLE public.user_prestige_runs
  VALIDATE CONSTRAINT user_prestige_runs_mode_check;
ALTER TABLE public.user_prestige_runs
  VALIDATE CONSTRAINT user_prestige_runs_season_check;
