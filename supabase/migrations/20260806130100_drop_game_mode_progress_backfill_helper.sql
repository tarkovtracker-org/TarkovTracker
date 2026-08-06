-- Every range migration has applied, so the one-shot helper is no longer needed.
DROP FUNCTION IF EXISTS private.backfill_game_mode_progress_range(UUID, UUID);
