-- Copies existing persistent PvP/PvE progress into the normalized table.
-- Kept out of the schema migration so a slow backfill can never roll back the schema: the app
-- falls back to user_progress for any account without a normalized row, and the compatibility
-- trigger plus the sync RPC populate rows on the next write.
-- Batched and idempotent, so a timeout or a retry resumes instead of starting over.
SET statement_timeout = '30min';

DO $$
DECLARE
  v_last_user UUID := NULL;
  v_batch_size CONSTANT INTEGER := 2000;
  v_batch_count INTEGER;
BEGIN
  LOOP
    WITH batch AS (
      SELECT
        progress.user_id,
        progress.pvp_data,
        progress.pve_data,
        progress.created_at,
        progress.updated_at
      FROM public.user_progress progress
      WHERE v_last_user IS NULL OR progress.user_id > v_last_user
      ORDER BY progress.user_id
      LIMIT v_batch_size
    ),
    inserted AS (
      INSERT INTO public.user_game_mode_progress (
        user_id,
        game_mode,
        season_number,
        progress_data,
        profile_public,
        created_at,
        updated_at
      )
      SELECT
        batch.user_id,
        mode.game_mode,
        0,
        public.sanitize_user_progress_mode_data(mode.progress_data),
        CASE mode.game_mode
          WHEN 'pvp' THEN COALESCE(preferences.profile_share_pvp_public, false)
          ELSE COALESCE(preferences.profile_share_pve_public, false)
        END,
        COALESCE(batch.created_at, now()),
        COALESCE(batch.updated_at, now())
      FROM batch
      CROSS JOIN LATERAL (
        VALUES
          ('pvp'::TEXT, COALESCE(batch.pvp_data, '{}'::jsonb)),
          ('pve'::TEXT, COALESCE(batch.pve_data, '{}'::jsonb))
      ) AS mode(game_mode, progress_data)
      LEFT JOIN public.user_preferences preferences ON preferences.user_id = batch.user_id
      ON CONFLICT (user_id, game_mode, season_number) DO NOTHING
      RETURNING 1
    )
    SELECT count(*), (SELECT last.user_id FROM batch last ORDER BY last.user_id DESC LIMIT 1)
    INTO v_batch_count, v_last_user
    FROM batch;
    EXIT WHEN COALESCE(v_batch_count, 0) = 0;
  END LOOP;
END;
$$;
