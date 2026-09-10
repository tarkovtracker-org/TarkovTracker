-- Forward correction: preserve the original migration because shared application is unverified.
-- Schema only; no historical rows are rewritten. Deploy both history migrations before the client.

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_manual_activity_entry(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN
        jsonb_typeof(payload) = 'object'
        AND jsonb_typeof(payload->'id') = 'string'
        AND nullif(btrim(payload->>'id'), '') IS NOT NULL
        AND jsonb_typeof(payload->'title') = 'string'
        AND nullif(btrim(payload->>'title'), '') IS NOT NULL
        AND jsonb_typeof(payload->'timestamp') = 'number'
        AND payload->>'type' IN ('task', 'hideout', 'item', 'system')
        AND payload->>'action' IN (
          'complete',
          'uncomplete',
          'fail',
          'reset_failed',
          'upgrade',
          'needed',
          'sync',
          'available'
        )
      THEN jsonb_strip_nulls(
        jsonb_build_object(
          'id', left(btrim(payload->>'id'), 128),
          'timestamp',
          to_jsonb(
            least(
              9007199254740991,
              greatest(0, trunc((payload->>'timestamp')::numeric))
            )::bigint
          ),
          'type', payload->>'type',
          'action', payload->>'action',
          'title', left(btrim(payload->>'title'), 200),
          'details',
          CASE
            WHEN jsonb_typeof(payload->'details') = 'string'
              AND nullif(btrim(payload->>'details'), '') IS NOT NULL
            THEN to_jsonb(left(btrim(payload->>'details'), 300))
            ELSE NULL
          END
        )
      )
      ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_manual_activity_history(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  WITH sanitized_entries AS (
    SELECT public.sanitize_user_progress_manual_activity_entry(entry.value) AS value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload) = 'array' THEN payload
        ELSE '[]'::jsonb
      END
    ) AS entry(value)
  ),
  deduped_entries AS (
    SELECT DISTINCT ON (value->>'id') value
    FROM sanitized_entries
    WHERE value IS NOT NULL
    ORDER BY value->>'id', ((value->>'timestamp')::bigint) DESC,
      (value->>'type') COLLATE "C", (value->>'action') COLLATE "C",
      (value->>'title') COLLATE "C", COALESCE(value->>'details', '') COLLATE "C"
  ),
  ordered_entries AS (
    SELECT value
    FROM deduped_entries
    ORDER BY ((value->>'timestamp')::bigint) DESC, (value->>'id') COLLATE "C"
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(value ORDER BY ((value->>'timestamp')::bigint) DESC, (value->>'id') COLLATE "C"), '[]'::jsonb)
  FROM ordered_entries;
$$;


CREATE OR REPLACE FUNCTION public.sanitize_manual_activity_epoch(payload jsonb)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE WHEN jsonb_typeof(payload) = 'number'
    THEN least(2147483647, greatest(0, trunc(payload::text::numeric)))::integer
    ELSE 0 END;
$$;

-- Merge under the caller's row lock. Missing history is an old client, not a deletion.
-- Full reset epochs still take precedence; history-only clearing advances its own epoch.
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
  IF old_epoch > new_epoch THEN
    history := existing->'manualActivityHistory';
  ELSIF new_epoch > old_epoch THEN
    history := incoming->'manualActivityHistory';
  ELSE
    history := public.sanitize_user_progress_manual_activity_history(existing->'manualActivityHistory')
      || public.sanitize_user_progress_manual_activity_history(incoming->'manualActivityHistory');
  END IF;
  RETURN COALESCE(incoming, '{}'::jsonb) || jsonb_build_object(
    'manualActivityEpoch', greatest(old_epoch, new_epoch),
    'manualActivityHistory', public.sanitize_user_progress_manual_activity_history(history)
  );
END;
$$;

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
      END,
      'xpOffset',
      CASE
        WHEN jsonb_typeof(payload->'xpOffset') = 'number'
        THEN to_jsonb(
          least(
            2147483647,
            greatest(-2147483648, trunc((payload->>'xpOffset')::numeric))
          )::int
        )
        ELSE NULL
      END
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.pvp_data := public.merge_manual_activity_progress(OLD.pvp_data, NEW.pvp_data);
    NEW.pve_data := public.merge_manual_activity_progress(OLD.pve_data, NEW.pve_data);
  END IF;
  NEW.pvp_data := public.sanitize_user_progress_mode_data(COALESCE(NEW.pvp_data, '{}'::jsonb));
  NEW.pve_data := public.sanitize_user_progress_mode_data(COALESCE(NEW.pve_data, '{}'::jsonb));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.progress_data := public.merge_manual_activity_progress(OLD.progress_data, NEW.progress_data);
  END IF;
  NEW.progress_data := public.sanitize_user_progress_mode_data(
    COALESCE(NEW.progress_data, '{}'::jsonb)
  );
  IF TG_OP = 'INSERT' THEN
    NEW.progress_updated_at := now();
  ELSIF NEW.progress_data IS DISTINCT FROM OLD.progress_data THEN
    NEW.progress_updated_at := now();
  ELSE
    NEW.progress_updated_at := OLD.progress_updated_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_user_game_mode_progress_row() FROM PUBLIC, anon, authenticated;

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
  v_existing_mode JSONB;
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

  -- The account lock serializes RPC writers, including a first insert for a mode.
  -- Merge before comparing for unchanged writes and before either table is mirrored.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    SELECT progress_data INTO v_existing_mode
    FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = v_mode
      AND season_number = CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END
    FOR UPDATE;
    v_existing_mode := COALESCE(v_existing_mode, CASE v_mode
      WHEN v_pvp_mode THEN v_existing_pvp WHEN v_pve_mode THEN v_existing_pve
      ELSE v_empty_object END);
    p_modes := jsonb_set(p_modes, ARRAY[v_mode],
      public.merge_manual_activity_progress(v_existing_mode, v_progress));
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

REVOKE ALL ON FUNCTION public.sanitize_manual_activity_epoch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_manual_activity_progress(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_user_progress_row() FROM PUBLIC, anon, authenticated;
-- Sanitizers run with the invoking row writer's permissions, including legacy clients.
GRANT EXECUTE ON FUNCTION public.sanitize_manual_activity_epoch(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_manual_activity_progress(jsonb, jsonb) TO authenticated, service_role;
