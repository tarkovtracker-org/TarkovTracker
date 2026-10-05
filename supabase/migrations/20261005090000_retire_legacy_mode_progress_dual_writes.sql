-- #1028 Phase 3: retire the legacy PvP/PvE dual writes.
--
-- user_game_mode_progress is the only progress store; user_progress keeps account metadata
-- (selected mode, edition, Tarkov UID). The production completion gate
-- private.unmaterialized_mode_progress returned zero rows for both modes in every UUID range
-- (2026-10-04), and Phase 2 (#1072) removed every application, server and gateway legacy reader,
-- so no write path still needs the legacy columns as a merge base.
--
-- After this migration:
-- * sync_user_game_mode_progress writes only account metadata to user_progress, and only when it
--   changed, so a mode-only sync no longer rewrites the account row or emits a user_progress
--   Realtime change; its normalized merge base is the normalized row alone.
-- * merge_progress_data creates a missing normalized row empty, never seeds from or mirrors to the
--   legacy columns, and no longer touches user_progress.
-- * The sync_legacy_user_progress_modes trigger and the unused legacy-only update_task_completion
--   writer are dropped, so a legacy column write can no longer reach normalized progress.
-- Signatures, grants and return contracts are unchanged for rolling clients and the deployed
-- Worker. pvp_data / pve_data remain in place (frozen) until Phase 4 drops them.

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

  -- Unchanged metadata leaves the account row, its timestamps and its Realtime stream untouched.
  UPDATE public.user_progress
  SET
    current_game_mode = p_current_game_mode,
    game_edition = COALESCE(p_game_edition, 1)
  WHERE user_id = v_user_id
    AND (current_game_mode, game_edition)
      IS DISTINCT FROM (p_current_game_mode, COALESCE(p_game_edition, 1));

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

  RETURN jsonb_build_object('tarkov_uid', v_stored_uid, 'tarkov_uid_conflict', v_uid_conflict,
    'metadata_write_id', (SELECT metadata_write_id FROM public.user_progress WHERE user_id = v_user_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_progress_data(
  p_user_id uuid,
  p_field text,
  p_task_completions jsonb DEFAULT NULL::jsonb,
  p_task_objectives jsonb DEFAULT NULL::jsonb,
  p_set jsonb DEFAULT NULL::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_data JSONB;
  v_game_mode TEXT;
  v_season_number SMALLINT;
  v_key TEXT;
  v_value JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  -- p_field keeps the gateway's legacy field names; it selects a normalized mode only.
  v_game_mode := CASE p_field
    WHEN 'pvp_data' THEN 'pvp'
    WHEN 'pve_data' THEN 'pve'
    WHEN 'seasonal_data' THEN 'seasonal'
    ELSE NULL
  END;
  IF v_game_mode IS NULL THEN
    RAISE EXCEPTION 'p_field must be pvp_data, pve_data, or seasonal_data';
  END IF;
  v_season_number := CASE
    WHEN v_game_mode = 'seasonal' THEN private.active_season_number()
    ELSE 0
  END;
  IF p_task_completions IS NOT NULL AND jsonb_typeof(p_task_completions) <> 'object' THEN
    RAISE EXCEPTION 'p_task_completions must be a JSON object';
  END IF;
  IF p_task_objectives IS NOT NULL AND jsonb_typeof(p_task_objectives) <> 'object' THEN
    RAISE EXCEPTION 'p_task_objectives must be a JSON object';
  END IF;
  IF p_set IS NOT NULL AND jsonb_typeof(p_set) <> 'object' THEN
    RAISE EXCEPTION 'p_set must be a JSON object';
  END IF;

  -- The account row lock serializes this writer with sync_user_game_mode_progress.
  PERFORM 1 FROM public.user_progress WHERE user_id = p_user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    progress_data
  )
  VALUES (p_user_id, v_game_mode, v_season_number, '{}'::jsonb)
  ON CONFLICT (user_id, game_mode, season_number) DO NOTHING;

  SELECT progress_data
  INTO v_data
  FROM public.user_game_mode_progress
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number
  FOR UPDATE;

  IF v_data IS NULL OR jsonb_typeof(v_data) <> 'object' THEN
    v_data := '{}'::jsonb;
  END IF;
  IF p_task_completions IS NOT NULL THEN
    v_data := jsonb_set(
      v_data,
      '{taskCompletions}',
      CASE WHEN jsonb_typeof(v_data->'taskCompletions') = 'object'
        THEN v_data->'taskCompletions' ELSE '{}'::jsonb END || p_task_completions
    );
  END IF;
  IF p_task_objectives IS NOT NULL THEN
    IF jsonb_typeof(v_data->'taskObjectives') IS DISTINCT FROM 'object' THEN
      v_data := jsonb_set(v_data, '{taskObjectives}', '{}'::jsonb);
    END IF;
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_task_objectives) LOOP
      IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'p_task_objectives values must be JSON objects';
      END IF;
      v_data := jsonb_set(
        v_data,
        ARRAY['taskObjectives', v_key],
        CASE WHEN jsonb_typeof(v_data#>ARRAY['taskObjectives', v_key]) = 'object'
          THEN v_data#>ARRAY['taskObjectives', v_key] ELSE '{}'::jsonb END || v_value,
        true
      );
    END LOOP;
  END IF;
  IF p_set IS NOT NULL THEN
    v_data := v_data || p_set;
  END IF;

  UPDATE public.user_game_mode_progress
  SET progress_data = v_data
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number;
  RETURN 1;
END;
$function$;

-- With no remaining legacy writer, the legacy-to-normalized bridge would only let a stray legacy
-- write overwrite normalized progress. New accounts get their normalized rows on first write.
DROP TRIGGER IF EXISTS sync_legacy_user_progress_modes ON public.user_progress;
DROP FUNCTION IF EXISTS public.sync_legacy_user_progress_modes();

-- Superseded by merge_progress_data, without callers, and service-role only: it writes only the
-- legacy columns, so without the bridge its writes would be silently lost.
DROP FUNCTION IF EXISTS public.update_task_completion(uuid, text, text, boolean, boolean, bigint);
