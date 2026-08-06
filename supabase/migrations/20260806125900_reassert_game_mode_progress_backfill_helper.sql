-- Re-asserts the backfill helper immediately before the range migrations.
--
-- 20260806120000 already creates it, but the superseded 20260806120100 migration dropped it at the
-- end of its run. Any environment that applied that migration successfully — production did not,
-- but a local database may have — would reach the range migrations with the helper gone. Asserting
-- it here makes the range migrations depend on migration order alone rather than on which
-- superseded migration an environment happened to apply.
CREATE OR REPLACE FUNCTION private.backfill_game_mode_progress_range(
  p_from UUID,
  p_to UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows BIGINT;
BEGIN
  INSERT INTO public.user_game_mode_progress AS target (
    user_id,
    game_mode,
    season_number,
    progress_data,
    profile_public,
    created_at,
    updated_at
  )
  SELECT
    progress.user_id,
    mode.game_mode,
    0,
    public.sanitize_user_progress_mode_data(mode.progress_data),
    CASE mode.game_mode
      WHEN 'pvp' THEN COALESCE(preferences.profile_share_pvp_public, false)
      ELSE COALESCE(preferences.profile_share_pve_public, false)
    END,
    COALESCE(progress.created_at, now()),
    COALESCE(progress.updated_at, now())
  FROM public.user_progress progress
  CROSS JOIN LATERAL (
    VALUES
      ('pvp'::TEXT, COALESCE(progress.pvp_data, '{}'::jsonb)),
      ('pve'::TEXT, COALESCE(progress.pve_data, '{}'::jsonb))
  ) AS mode(game_mode, progress_data)
  LEFT JOIN public.user_preferences preferences ON preferences.user_id = progress.user_id
  WHERE progress.user_id >= p_from
    AND (p_to IS NULL OR progress.user_id < p_to)
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET progress_data = EXCLUDED.progress_data
  WHERE target.progress_data->'level' IS NULL
    AND EXCLUDED.progress_data->'level' IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION private.backfill_game_mode_progress_range(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
