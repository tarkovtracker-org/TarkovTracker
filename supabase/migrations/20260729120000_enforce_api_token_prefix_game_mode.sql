-- Keep the cosmetic PVP_/PVE_ prefix in api_tokens.token_value aligned with the
-- authoritative api_tokens.game_mode, so a token can never display a mode it does
-- not authorize. NOT VALID: new and updated rows are checked, historical rows are
-- left as-is (legacy tt_ tokens predate the prefix scheme).
ALTER TABLE public.api_tokens
  DROP CONSTRAINT IF EXISTS api_tokens_token_value_game_mode_match;

ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_token_value_game_mode_match
  CHECK (token_value IS NULL OR left(token_value, 4) = upper(game_mode) || '_')
  NOT VALID;

COMMENT ON CONSTRAINT api_tokens_token_value_game_mode_match ON public.api_tokens IS
  'token_value must carry the PVP_/PVE_ prefix matching game_mode; the API gateway rejects tokens whose prefix and stored game mode disagree.';
