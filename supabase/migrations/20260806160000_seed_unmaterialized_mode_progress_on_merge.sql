-- Seed an unmaterialized persistent mode row from its legacy column before merging.
--
-- The existing seed is an INSERT ... ON CONFLICT DO NOTHING, so it only fires when no row exists.
-- A row created by the visibility RPC or the legacy sharing trigger already exists and carries no
-- level, because the BEFORE trigger sanitizes '{}' into the empty shape. For those accounts the
-- merge started from the placeholder and then mirrored the near-empty result back over
-- user_progress.pvp_data / pve_data, destroying the level, display name, and every task completion
-- the account had.
--
-- This adds a second seed inside the same FOR UPDATE transaction: when the locked row has no
-- numeric level and the legacy column does, the legacy payload becomes the merge base. Being inside
-- the row lock makes it atomic, so a concurrent write cannot interleave and lose an update. The
-- level test matches private.backfill_game_mode_progress_range, so a row that already holds real
-- data is never touched, and Seasonal is excluded because it has no legacy column.
--
-- The level checks use IS DISTINCT FROM because jsonb_typeof() of an absent key returns SQL NULL,
-- which would make a plain <> comparison NULL and silently skip the branch.
--
-- Schema only. No table scan and no bulk rewrite: a row is seeded lazily by the write that needs it.
CREATE OR REPLACE FUNCTION public.merge_progress_data(
  p_user_id UUID,
  p_field TEXT,
  p_task_completions JSONB DEFAULT NULL,
  p_task_objectives JSONB DEFAULT NULL,
  p_set JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data JSONB;
  v_game_mode TEXT;
  v_legacy JSONB;
  v_season_number SMALLINT;
  v_key TEXT;
  v_value JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
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
  SELECT
    p_user_id,
    v_game_mode,
    v_season_number,
    CASE v_game_mode
      WHEN 'pvp' THEN pvp_data
      WHEN 'pve' THEN pve_data
      ELSE '{}'::jsonb
    END
  FROM public.user_progress
  WHERE user_id = p_user_id
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
  IF v_game_mode IN ('pvp', 'pve')
    AND jsonb_typeof(v_data->'level') IS DISTINCT FROM 'number' THEN
    SELECT CASE v_game_mode WHEN 'pvp' THEN pvp_data ELSE pve_data END
    INTO v_legacy
    FROM public.user_progress
    WHERE user_id = p_user_id;
    IF jsonb_typeof(v_legacy) = 'object' AND jsonb_typeof(v_legacy->'level') = 'number' THEN
      v_data := v_legacy;
    END IF;
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

  IF v_game_mode = 'pvp' THEN
    UPDATE public.user_progress SET pvp_data = v_data WHERE user_id = p_user_id;
  ELSIF v_game_mode = 'pve' THEN
    UPDATE public.user_progress SET pve_data = v_data WHERE user_id = p_user_id;
  ELSE
    UPDATE public.user_progress SET updated_at = now() WHERE user_id = p_user_id;
  END IF;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  TO service_role;
