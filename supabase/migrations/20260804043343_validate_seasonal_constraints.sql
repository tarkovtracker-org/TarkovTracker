ALTER TABLE public.user_progress
  VALIDATE CONSTRAINT user_progress_current_game_mode_check;
ALTER TABLE public.teams
  VALIDATE CONSTRAINT teams_game_mode_check;
ALTER TABLE public.team_memberships
  VALIDATE CONSTRAINT team_memberships_game_mode_check;
ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_game_mode_check;
UPDATE public.api_tokens
SET token_value = NULL,
    is_active = FALSE
WHERE token_value IS NOT NULL
  AND token_value NOT LIKE upper(game_mode) || '\_%' ESCAPE '\';
ALTER TABLE public.api_tokens
  VALIDATE CONSTRAINT api_tokens_token_value_game_mode_match;
ALTER TABLE public.user_system
  VALIDATE CONSTRAINT user_system_seasonal_team_id_fkey;
ALTER TABLE public.user_prestige_runs
  VALIDATE CONSTRAINT user_prestige_runs_mode_check;
ALTER TABLE public.user_prestige_runs
  VALIDATE CONSTRAINT user_prestige_runs_season_check;
