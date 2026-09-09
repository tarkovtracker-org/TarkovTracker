-- Preserve legacy mirroring while avoiding duplicate WAL events and timestamp churn.
CREATE OR REPLACE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_modes JSONB,
  p_seasonal_season_number SMALLINT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_mode TEXT;
  v_pvp_mode CONSTANT TEXT := 'pvp';
  v_pve_mode CONSTANT TEXT := 'pve';
  v_seasonal_mode CONSTANT TEXT := 'seasonal';
  v_empty_object CONSTANT JSONB := '{}'::jsonb;
  v_progress JSONB;
  v_season_number SMALLINT;
  v_active_season SMALLINT := private.active_season_number();
  v_existing_pvp JSONB := v_empty_object;
  v_existing_pve JSONB := v_empty_object;
  v_rate_allowed BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_game_mode IS NULL
    OR p_current_game_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;
  IF pg_column_size(p_modes) > 524288 THEN
    RAISE EXCEPTION 'p_modes exceeds the maximum payload size';
  END IF;

  -- Validate every mode before spending rate-limit budget: a later RAISE would
  -- roll the whole transaction back, refunding the consumed slot and leaving
  -- malformed requests effectively unthrottled.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
      RAISE EXCEPTION 'Unsupported game mode: %', v_mode;
    END IF;
    IF jsonb_typeof(v_progress) <> 'object' THEN
      RAISE EXCEPTION 'Progress for % must be a JSON object', v_mode;
    END IF;
  END LOOP;

  SELECT allowed
  INTO v_rate_allowed
  FROM public.consume_mutation_rate_limit('progress-sync', v_user_id::TEXT, 60, 60);
  IF NOT COALESCE(v_rate_allowed, false) THEN
    RAISE EXCEPTION 'Progress sync rate limit exceeded';
  END IF;

  INSERT INTO public.user_progress (
    user_id,
    current_game_mode,
    game_edition,
    tarkov_uid,
    pvp_data,
    pve_data
  )
  VALUES (
    v_user_id,
    p_current_game_mode,
    COALESCE(p_game_edition, 1),
    p_tarkov_uid,
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pvp_mode, v_empty_object)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pve_mode, v_empty_object))
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    COALESCE(pvp_data, v_empty_object),
    COALESCE(pve_data, v_empty_object)
  INTO v_existing_pvp, v_existing_pve
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

  INSERT INTO public.user_progress (
    user_id,
    current_game_mode,
    game_edition,
    tarkov_uid,
    pvp_data,
    pve_data
  )
  VALUES (
    v_user_id,
    p_current_game_mode,
    COALESCE(p_game_edition, 1),
    p_tarkov_uid,
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pvp_mode, v_existing_pvp)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pve_mode, v_existing_pve))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_game_mode = EXCLUDED.current_game_mode,
    game_edition = EXCLUDED.game_edition,
    tarkov_uid = EXCLUDED.tarkov_uid,
    pvp_data = EXCLUDED.pvp_data,
    pve_data = EXCLUDED.pve_data
  WHERE (user_progress.current_game_mode, user_progress.game_edition,
         user_progress.tarkov_uid, user_progress.pvp_data, user_progress.pve_data)
    IS DISTINCT FROM
        (EXCLUDED.current_game_mode, EXCLUDED.game_edition,
         EXCLUDED.tarkov_uid, EXCLUDED.pvp_data, EXCLUDED.pve_data);

  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode = v_seasonal_mode
      AND (p_seasonal_season_number IS NULL OR p_seasonal_season_number <> v_active_season) THEN
      -- A client sync always carries every mode in one payload. Skip stale
      -- Seasonal state instead of raising, which would roll back the valid
      -- persistent-mode progress from the same request and take cloud sync
      -- offline for every client whose bundled season number lags the database.
      CONTINUE;
    END IF;
    v_season_number := CASE
      WHEN v_mode = v_seasonal_mode THEN v_active_season
      ELSE 0
    END;
    INSERT INTO public.user_game_mode_progress (
      user_id,
      game_mode,
      season_number,
      progress_data
    )
    VALUES (
      v_user_id,
      v_mode,
      v_season_number,
      public.sanitize_user_progress_mode_data(v_progress)
    )
    ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data
    WHERE user_game_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  TO authenticated;
