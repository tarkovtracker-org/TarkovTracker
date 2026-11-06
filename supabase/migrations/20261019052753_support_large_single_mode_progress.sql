-- #960: the supported full-mode stress fixture exceeds 512 KiB (922,374 bytes of JSONB).
-- Keep a finite pre-sanitization limit with 1 MiB per request; clients still split large
-- multi-mode saves. See progress_payload_boundary.test.sql and docs/systems/progress-sync.md.
-- Only the size predicate changes; ownership, row locks, merges, grants and freshness stay intact.

CREATE OR REPLACE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode text,
  p_game_edition integer,
  p_tarkov_uid bigint,
  p_modes jsonb,
  p_seasonal_season_number smallint DEFAULT NULL::smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_mode TEXT;
  v_pvp_mode CONSTANT TEXT := 'pvp';
  v_pve_mode CONSTANT TEXT := 'pve';
  v_seasonal_mode CONSTANT TEXT := 'seasonal';
  v_empty_object CONSTANT JSONB := '{}'::jsonb;
  v_progress JSONB;
  v_existing_mode JSONB;
  v_season_number SMALLINT;
  v_active_season SMALLINT := private.active_season_number();
  v_rate_allowed BOOLEAN;
  v_stored_uid BIGINT;
  v_uid_conflict BOOLEAN := false;
  v_constraint TEXT;
  v_rows_changed INTEGER;
  v_persistent_changed BOOLEAN := false;
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
  IF pg_column_size(p_modes) > 1048576 THEN
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

  -- The account row carries metadata only; its legacy mode columns keep their defaults.
  INSERT INTO public.user_progress (user_id, current_game_mode, game_edition, tarkov_uid)
  VALUES (v_user_id, p_current_game_mode, COALESCE(p_game_edition, 1), NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT tarkov_uid
  INTO v_stored_uid
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- The account lock serializes RPC writers, including a first insert for a mode. Merge against
  -- the stored normalized row before comparing for unchanged writes.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    SELECT progress_data INTO v_existing_mode
    FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = v_mode
      AND season_number = CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END
    FOR UPDATE;
    p_modes := jsonb_set(p_modes, ARRAY[v_mode],
      public.merge_manual_activity_progress(
        COALESCE(v_existing_mode, v_empty_object), v_progress));
  END LOOP;

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
    GET DIAGNOSTICS v_rows_changed = ROW_COUNT;
    v_persistent_changed := v_persistent_changed
      OR (v_mode IN (v_pvp_mode, v_pve_mode) AND v_rows_changed > 0);
  END LOOP;

  -- Preserve the accepted v1 account-clock contract once per sync, without writing legacy JSON.
  -- Seasonal-only syncs still leave this clock alone; identical persistent syncs do as well.
  UPDATE public.user_progress
  SET current_game_mode = p_current_game_mode,
    game_edition = COALESCE(p_game_edition, 1), updated_at = now()
  WHERE user_id = v_user_id
    AND (v_persistent_changed OR (current_game_mode, game_edition)
      IS DISTINCT FROM (p_current_game_mode, COALESCE(p_game_edition, 1)));

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

  RETURN jsonb_build_object('tarkov_uid', v_stored_uid, 'tarkov_uid_conflict', v_uid_conflict,
    'metadata_write_id', (SELECT metadata_write_id FROM public.user_progress WHERE user_id = v_user_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_game_profile_progress(
  p_profile_id UUID,
  p_game_edition INTEGER,
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
  v_pvp_mode CONSTANT TEXT := 'pvp';
  v_pve_mode CONSTANT TEXT := 'pve';
  v_seasonal_mode CONSTANT TEXT := 'seasonal';
  v_empty_object CONSTANT JSONB := '{}'::jsonb;
  v_active_season SMALLINT := private.active_season_number();
  v_default BOOLEAN;
  v_mode TEXT;
  v_progress JSONB;
  v_existing JSONB;
  v_season_number SMALLINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;
  IF pg_column_size(p_modes) > 1048576 THEN
    RAISE EXCEPTION 'p_modes exceeds the maximum payload size';
  END IF;
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
      RAISE EXCEPTION 'Unsupported game mode: %', v_mode;
    END IF;
    IF jsonb_typeof(v_progress) <> 'object' THEN
      RAISE EXCEPTION 'Progress for % must be a JSON object', v_mode;
    END IF;
  END LOOP;

  PERFORM private.consume_game_profile_rate_limit(v_user_id, 'game-profile-sync');

  SELECT is_default INTO v_default FROM public.user_game_profiles
  WHERE id = p_profile_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game profile not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_default THEN
    RAISE EXCEPTION 'The default game profile uses the standard progress sync'
      USING ERRCODE = 'PT409';
  END IF;
  IF NOT private.game_profiles_unlocked(v_user_id) THEN
    RAISE EXCEPTION 'Game profiles require supporter access' USING ERRCODE = 'PT403';
  END IF;

  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode = v_seasonal_mode
      AND (p_seasonal_season_number IS NULL OR p_seasonal_season_number <> v_active_season) THEN
      CONTINUE;
    END IF;
    v_season_number := CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END;
    SELECT progress_data INTO v_existing FROM public.user_profile_mode_progress
    WHERE profile_id = p_profile_id AND game_mode = v_mode AND season_number = v_season_number;
    INSERT INTO public.user_profile_mode_progress (
      profile_id, user_id, game_mode, season_number, progress_data
    )
    VALUES (
      p_profile_id, v_user_id, v_mode, v_season_number,
      public.sanitize_user_progress_mode_data(
        public.merge_manual_activity_progress(COALESCE(v_existing, v_empty_object), v_progress))
    )
    ON CONFLICT (profile_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data, updated_at = now()
    WHERE user_profile_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
  END LOOP;

  UPDATE public.user_game_profiles
  SET game_edition = p_game_edition, updated_at = now()
  WHERE id = p_profile_id AND p_game_edition IS NOT NULL
    AND game_edition IS DISTINCT FROM p_game_edition;

  RETURN jsonb_build_object('profile_id', p_profile_id);
END;
$$;
