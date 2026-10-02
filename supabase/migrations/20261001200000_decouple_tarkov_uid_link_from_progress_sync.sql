-- Decouple Tarkov UID linking from progress persistence (#959).
--
-- `sync_user_game_mode_progress` wrote `tarkov_uid` in the same statement as progress, so a UID
-- already owned by another account (`user_progress_tarkov_uid_unique`) rolled back the whole sync
-- and every later sync that carried the same local UID. Progress and metadata now commit first and
-- the link is applied last inside a savepoint: on that constraint's violation the account keeps its
-- stored link and the call returns `{ "tarkov_uid": <stored>, "tarkov_uid_conflict": true }`.
-- The unique constraint is unchanged, and a concurrent link attempt resolves the same way.
-- `archive_prestige_run_and_reset_progress` calls this function with PERFORM, so it inherits the
-- behavior. Changing the return type from void requires dropping the function; grants are restored.

DROP FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT);

CREATE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_modes JSONB,
  p_seasonal_season_number SMALLINT DEFAULT NULL
)
RETURNS jsonb
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
  v_existing_mode JSONB;
  v_legacy_mode JSONB;
  v_season_number SMALLINT;
  v_active_season SMALLINT := private.active_season_number();
  v_existing_pvp JSONB := v_empty_object;
  v_existing_pve JSONB := v_empty_object;
  v_rate_allowed BOOLEAN;
  v_stored_uid BIGINT;
  v_uid_conflict BOOLEAN := false;
  v_constraint TEXT;
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
    NULL,
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pvp_mode, v_empty_object)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pve_mode, v_empty_object))
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    COALESCE(pvp_data, v_empty_object),
    COALESCE(pve_data, v_empty_object),
    tarkov_uid
  INTO v_existing_pvp, v_existing_pve, v_stored_uid
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- The account lock serializes RPC writers, including a first insert for a mode.
  -- Merge before comparing for unchanged writes and before either table is mirrored.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    SELECT progress_data INTO v_existing_mode
    FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = v_mode
      AND season_number = CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END
    FOR UPDATE;
    v_legacy_mode := CASE v_mode
      WHEN v_pvp_mode THEN v_existing_pvp WHEN v_pve_mode THEN v_existing_pve
      ELSE v_empty_object END;
    -- A placeholder row created by the visibility RPC or the legacy sharing trigger exists but
    -- carries no level, so COALESCE alone would merge from the empty shape and drop the legacy
    -- column's history and reset epoch. Seed from the legacy payload already locked above, using
    -- the same numeric-level test as public.merge_progress_data, so a row that already holds real
    -- data is never replaced. Seasonal has no legacy column, so its empty object never qualifies.
    IF v_existing_mode IS NULL
      OR (jsonb_typeof(v_existing_mode->'level') IS DISTINCT FROM 'number'
          AND jsonb_typeof(v_legacy_mode->'level') = 'number') THEN
      v_existing_mode := v_legacy_mode;
    END IF;
    p_modes := jsonb_set(p_modes, ARRAY[v_mode],
      public.merge_manual_activity_progress(
        COALESCE(v_existing_mode, v_empty_object), v_progress));
  END LOOP;

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
    v_stored_uid,
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pvp_mode, v_existing_pvp)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->v_pve_mode, v_existing_pve))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_game_mode = EXCLUDED.current_game_mode,
    game_edition = EXCLUDED.game_edition,
    pvp_data = EXCLUDED.pvp_data,
    pve_data = EXCLUDED.pve_data
  WHERE (user_progress.current_game_mode, user_progress.game_edition,
         user_progress.pvp_data, user_progress.pve_data)
    IS DISTINCT FROM
        (EXCLUDED.current_game_mode, EXCLUDED.game_edition,
         EXCLUDED.pvp_data, EXCLUDED.pve_data);

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

  -- Link last, in its own savepoint: a UID owned by another account leaves this account's link
  -- unchanged and is reported, instead of rolling back the progress written above.
  IF p_tarkov_uid IS DISTINCT FROM v_stored_uid THEN
    BEGIN
      UPDATE public.user_progress SET tarkov_uid = p_tarkov_uid WHERE user_id = v_user_id;
      v_stored_uid := p_tarkov_uid;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'user_progress_tarkov_uid_unique' THEN
        RAISE;
      END IF;
      v_uid_conflict := true;
    END;
  END IF;

  RETURN jsonb_build_object('tarkov_uid', v_stored_uid, 'tarkov_uid_conflict', v_uid_conflict);
END;
$$;


REVOKE ALL ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  TO authenticated;
