-- Schema only: preserve saved levels and discard obsolete XP offsets on future writes.
-- Existing JSON cleanup is a separate, approved bounded maintenance operation.
SET lock_timeout = '5s';

ALTER TABLE public.user_preferences DROP COLUMN use_automatic_level_calculation;

-- Keep owner-bounded maintenance indexed for non-default profile progress too.
CREATE INDEX user_profile_mode_progress_user_id_idx
  ON public.user_profile_mode_progress (user_id);

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_mode_data(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  WITH raw_last_api_update AS (
    SELECT public.sanitize_user_progress_api_update_meta(payload->'lastApiUpdate') AS value
  ),
  sanitized_api_update_history AS (
    SELECT public.sanitize_user_progress_api_update_history(
      CASE
        WHEN (SELECT value FROM raw_last_api_update) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              public.sanitize_user_progress_api_update_history(payload->'apiUpdateHistory')
            ) AS entry(value)
            WHERE entry.value->>'id' = (SELECT value->>'id' FROM raw_last_api_update)
          )
        THEN jsonb_build_array((SELECT value FROM raw_last_api_update))
          || CASE
            WHEN jsonb_typeof(payload->'apiUpdateHistory') = 'array'
            THEN payload->'apiUpdateHistory'
            ELSE '[]'::jsonb
          END
        ELSE payload->'apiUpdateHistory'
      END
    ) AS value
  ),
  matched_history_at AS (
    SELECT (entry.value->>'at')::bigint AS value
    FROM jsonb_array_elements(
      (SELECT value FROM sanitized_api_update_history)
    ) AS entry(value)
    WHERE (SELECT value FROM raw_last_api_update) IS NOT NULL
      AND entry.value->>'id' = ((SELECT value FROM raw_last_api_update)->>'id')
    ORDER BY (entry.value->>'at')::bigint DESC
    LIMIT 1
  ),
  sanitized_last_api_update AS (
    SELECT
      CASE
        WHEN (SELECT value FROM raw_last_api_update) IS NULL THEN NULL
        WHEN (SELECT value FROM matched_history_at) IS NOT NULL
          AND (SELECT value FROM matched_history_at)
              > ((SELECT value FROM raw_last_api_update)->>'at')::bigint
        THEN jsonb_set(
          (SELECT value FROM raw_last_api_update),
          '{at}',
          to_jsonb((SELECT value FROM matched_history_at))
        )
        ELSE (SELECT value FROM raw_last_api_update)
      END AS value
  )
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'displayName',
      CASE
        WHEN jsonb_typeof(payload->'displayName') = 'string'
          AND nullif(btrim(payload->>'displayName'), '') IS NOT NULL
        THEN to_jsonb(left(btrim(payload->>'displayName'), 64))
        ELSE NULL
      END,
      'hideoutModules',
      CASE
        WHEN jsonb_typeof(payload->'hideoutModules') = 'object'
        THEN payload->'hideoutModules'
        ELSE '{}'::jsonb
      END,
      'hideoutParts',
      CASE
        WHEN jsonb_typeof(payload->'hideoutParts') = 'object'
        THEN payload->'hideoutParts'
        ELSE '{}'::jsonb
      END,
      'lastApiUpdate',
      (SELECT value FROM sanitized_last_api_update),
      'apiUpdateHistory',
      (SELECT value FROM sanitized_api_update_history),
      'manualActivityEpoch',
      public.sanitize_manual_activity_epoch(payload->'manualActivityEpoch'),
      'manualActivityHistory',
      public.sanitize_user_progress_manual_activity_history(payload->'manualActivityHistory'),
      'level',
      CASE
        WHEN jsonb_typeof(payload->'level') = 'number'
        THEN to_jsonb(
          greatest(
            1,
            least(
              2147483647,
              greatest(-2147483648, trunc((payload->>'level')::numeric))
            )::int
          )
        )
        ELSE NULL
      END,
      'pmcFaction',
      CASE
        WHEN payload->>'pmcFaction' IN ('BEAR', 'USEC')
        THEN to_jsonb(payload->>'pmcFaction')
        ELSE NULL
      END,
      'prestigeLevel',
      CASE
        WHEN jsonb_typeof(payload->'prestigeLevel') = 'number'
        THEN to_jsonb(
          least(
            6,
            greatest(
              0,
              least(
                2147483647,
                greatest(-2147483648, trunc((payload->>'prestigeLevel')::numeric))
              )::int
            )
          )
        )
        ELSE NULL
      END,
      'progressEpoch',
      CASE
        WHEN jsonb_typeof(payload->'progressEpoch') = 'number'
        THEN to_jsonb(
          greatest(
            0,
            least(
              2147483647,
              greatest(-2147483648, trunc((payload->>'progressEpoch')::numeric))
            )::int
          )
        )
        ELSE to_jsonb(0)
      END,
      'skillOffsets',
      CASE
        WHEN jsonb_typeof(payload->'skillOffsets') = 'object'
        THEN payload->'skillOffsets'
        ELSE '{}'::jsonb
      END,
      'skills',
      CASE
        WHEN jsonb_typeof(payload->'skills') = 'object'
        THEN (
          SELECT COALESCE(
            jsonb_object_agg(
              skill.key,
              CASE
                WHEN skill.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN to_jsonb(least(51, greatest(0, trunc((skill.value)::numeric)::int)))
                ELSE to_jsonb(0)
              END
            ),
            '{}'::jsonb
          )
          FROM jsonb_each_text(payload->'skills') AS skill(key, value)
        )
        ELSE '{}'::jsonb
      END,
      'storyChapters',
      CASE
        WHEN jsonb_typeof(payload->'storyChapters') = 'object'
        THEN payload->'storyChapters'
        ELSE '{}'::jsonb
      END,
      'taskAvailability',
      public.merge_task_availability(NULL, payload->'taskAvailability'),
      'taskCompletions',
      CASE
        WHEN jsonb_typeof(payload->'taskCompletions') = 'object'
        THEN payload->'taskCompletions'
        ELSE '{}'::jsonb
      END,
      'taskObjectives',
      CASE
        WHEN jsonb_typeof(payload->'taskObjectives') = 'object'
        THEN payload->'taskObjectives'
        ELSE '{}'::jsonb
      END,
      'traders',
      CASE
        WHEN jsonb_typeof(payload->'traders') = 'object'
        THEN payload->'traders'
        ELSE '{}'::jsonb
      END
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.merge_manual_activity_progress(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  old_reset integer := public.sanitize_manual_activity_epoch(existing->'progressEpoch');
  new_reset integer := public.sanitize_manual_activity_epoch(incoming->'progressEpoch');
  old_epoch integer := public.sanitize_manual_activity_epoch(existing->'manualActivityEpoch');
  new_epoch integer := public.sanitize_manual_activity_epoch(incoming->'manualActivityEpoch');
  history jsonb;
BEGIN
  IF old_reset > new_reset THEN RETURN existing; END IF;
  IF new_reset > old_reset THEN RETURN incoming; END IF;
  -- Cached clients still derive levels from XP after their offset is retired.
  -- Keep their existing level until refresh; new clients omit xpOffset entirely.
  -- Explicit reset epochs above remain authoritative, including prestige resets.
  IF incoming ? 'xpOffset' AND jsonb_typeof(existing->'level') = 'number' THEN
    incoming := jsonb_set(incoming, '{level}', existing->'level');
  END IF;
  IF old_epoch > new_epoch THEN
    history := existing->'manualActivityHistory';
  ELSIF new_epoch > old_epoch THEN
    history := incoming->'manualActivityHistory';
  ELSE
    history := public.sanitize_user_progress_manual_activity_history(existing->'manualActivityHistory')
      || public.sanitize_user_progress_manual_activity_history(incoming->'manualActivityHistory');
  END IF;
  RETURN public.carry_api_update_task_counts(existing, COALESCE(incoming, '{}'::jsonb))
    || jsonb_build_object(
      'manualActivityEpoch', greatest(old_epoch, new_epoch),
      'manualActivityHistory', public.sanitize_user_progress_manual_activity_history(history),
      'taskAvailability', public.merge_task_availability(
        existing->'taskAvailability',
        incoming->'taskAvailability'
      )
    );
END;
$$;
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

  -- API writes use their explicit level, even while stored legacy offsets await cleanup.
  -- Only client sync payloads retain the marker used to freeze cached automatic writers.
  v_data := v_data - 'xpOffset';
  UPDATE public.user_game_mode_progress
  SET progress_data = v_data
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number;
  -- Every API write advanced the account clock before mirror retirement. Preserve that v1
  -- contract for cached clients, including no-op API requests, without rewriting legacy JSON.
  UPDATE public.user_progress SET updated_at = now() WHERE user_id = p_user_id;
  RETURN 1;
END;
$function$;
