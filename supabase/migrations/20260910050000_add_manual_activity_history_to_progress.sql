-- Persist manual activity-log entries inside the per-mode progress blob (issue #445).
--
-- Manual activity entries used to live in a standalone browser `useStorage` ref, so they were
-- offline-only and were destroyed whenever the singleton store reset its state across a
-- login/logout/user-switch transition. They now travel inside UserProgressData next to
-- `apiUpdateHistory`, which means they must be accepted by the persisted sanitizer.
--
-- `sanitize_user_progress_mode_data` is a strict jsonb_build_object allowlist invoked by the
-- BEFORE triggers on public.user_progress and public.user_game_mode_progress and directly by
-- sync_user_game_mode_progress / archive_prestige_run_and_reset_progress. Without this migration
-- every write silently strips `manualActivityHistory`, so entries would appear locally and then
-- vanish on the next remote read.
--
-- Mirrors app/utils/progressSanitizers.ts: entries require a non-empty id, a non-empty title, a
-- numeric millisecond timestamp, and a known type/action. Ids, titles, and details are clamped and
-- the history is deduplicated by id (newest wins), ordered newest first, and capped at 50 entries
-- per mode so the blob stays far below the sync RPC's 512 KiB payload ceiling.
--
-- Schema only. No bulk rewrite: `manualActivityHistory` is optional and every reader tolerates its
-- absence, so historical rows simply carry no manual history until their owner writes one.

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_manual_activity_entry(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
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
              9223372036854775807,
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
    ORDER BY value->>'id', ((value->>'timestamp')::bigint) DESC
  ),
  ordered_entries AS (
    SELECT value
    FROM deduped_entries
    ORDER BY ((value->>'timestamp')::bigint) DESC
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
  FROM ordered_entries;
$$;

-- Recreate the mode-data sanitizer with `manualActivityHistory` added to the allowlist. Every
-- other branch is carried over unchanged from 20260606150000_reconcile_last_api_update_clamp.sql,
-- including the lastApiUpdate/apiUpdateHistory reconciliation.
CREATE OR REPLACE FUNCTION public.sanitize_user_progress_mode_data(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
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

-- Advisor lint 0011: pin search_path on the new IMMUTABLE jsonb helpers, matching the sibling
-- sanitizers hardened in 20260629120000_fix_function_search_path_and_definer_grants.sql.
DO $$
DECLARE
  fn text;
  pin_path text[] := ARRAY[
    'public.sanitize_user_progress_manual_activity_entry(jsonb)',
    'public.sanitize_user_progress_manual_activity_history(jsonb)',
    'public.sanitize_user_progress_mode_data(jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY pin_path LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn);
    END IF;
  END LOOP;
END $$;

-- Regression coverage for the new field and for the branches it must not disturb.
DO $$
DECLARE
  sanitized jsonb;
  history jsonb;
BEGIN
  -- A valid manual entry survives and keeps its millisecond timestamp.
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'manualActivityHistory',
      jsonb_build_array(
        jsonb_build_object(
          'id', 'manual-1',
          'timestamp', 1780000000000::bigint,
          'type', 'task',
          'action', 'complete',
          'title', 'Completed Task: Debut',
          'details', 'PvP'
        )
      )
    )
  );

  IF jsonb_array_length(sanitized->'manualActivityHistory') <> 1 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: a valid manual activity entry must be preserved';
  END IF;

  IF (sanitized->'manualActivityHistory'->0->>'timestamp')::bigint <> 1780000000000 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: manual activity timestamp must not be clamped to int32';
  END IF;

  IF (sanitized->'manualActivityHistory'->0->>'details') <> 'PvP' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: manual activity details must be preserved';
  END IF;

  -- Malformed entries are dropped: missing title, unknown type, unknown action, absent timestamp.
  history := public.sanitize_user_progress_manual_activity_history(
    jsonb_build_array(
      jsonb_build_object('id', 'no-title', 'timestamp', 10, 'type', 'task', 'action', 'complete'),
      jsonb_build_object(
        'id', 'bad-type', 'timestamp', 10, 'type', 'quest', 'action', 'complete', 'title', 'x'
      ),
      jsonb_build_object(
        'id', 'bad-action', 'timestamp', 10, 'type', 'task', 'action', 'deleted', 'title', 'x'
      ),
      jsonb_build_object('id', 'no-timestamp', 'type', 'task', 'action', 'complete', 'title', 'x'),
      '"not-an-object"'::jsonb,
      'null'::jsonb
    )
  );

  IF history <> '[]'::jsonb THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: malformed entries must be dropped, got %',
      history;
  END IF;

  -- Duplicate ids collapse to the newest entry and ordering is newest first.
  history := public.sanitize_user_progress_manual_activity_history(
    jsonb_build_array(
      jsonb_build_object(
        'id', 'dup', 'timestamp', 100, 'type', 'task', 'action', 'complete', 'title', 'old'
      ),
      jsonb_build_object(
        'id', 'dup', 'timestamp', 900, 'type', 'task', 'action', 'complete', 'title', 'new'
      ),
      jsonb_build_object(
        'id', 'other', 'timestamp', 500, 'type', 'hideout', 'action', 'upgrade', 'title', 'mid'
      )
    )
  );

  IF jsonb_array_length(history) <> 2 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: duplicate ids must collapse';
  END IF;

  IF (history->0->>'title') <> 'new' OR (history->1->>'title') <> 'mid' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: entries must be newest first, got %',
      history;
  END IF;

  -- The history is capped at 50 entries.
  history := public.sanitize_user_progress_manual_activity_history(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', 'entry-' || gs::text,
          'timestamp', 1780000000000::bigint + gs,
          'type', 'task',
          'action', 'complete',
          'title', 'Task ' || gs::text
        )
      )
      FROM generate_series(1, 70) AS gs
    )
  );

  IF jsonb_array_length(history) <> 50 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: history must be capped at 50 entries';
  END IF;

  IF (history->0->>'id') <> 'entry-70' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: the cap must retain the newest entries';
  END IF;

  -- Long strings are clamped rather than rejected.
  history := public.sanitize_user_progress_manual_activity_history(
    jsonb_build_array(
      jsonb_build_object(
        'id', repeat('i', 200),
        'timestamp', 10,
        'type', 'task',
        'action', 'complete',
        'title', repeat('t', 400),
        'details', repeat('d', 600)
      )
    )
  );

  IF length(history->0->>'id') <> 128
    OR length(history->0->>'title') <> 200
    OR length(history->0->>'details') <> 300 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_manual_activity_history regression: oversized strings must be clamped';
  END IF;

  -- An absent or non-array manualActivityHistory normalizes to an empty array.
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object('manualActivityHistory', 'nonsense')
  );

  IF sanitized->'manualActivityHistory' <> '[]'::jsonb THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: a non-array manualActivityHistory must normalize to []';
  END IF;

  -- Unknown payload keys are still stripped.
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object('level', 12, 'somethingElse', 'nope')
  );

  IF sanitized ? 'somethingElse' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: unknown payload keys were not stripped';
  END IF;

  -- The carried-over lastApiUpdate reconciliation still applies.
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'sync-1', 'source', 'api', 'at', 2147483647),
      'apiUpdateHistory',
      jsonb_build_array(
        jsonb_build_object('id', 'sync-1', 'source', 'api', 'at', 1780000000000::bigint)
      )
    )
  );

  IF (sanitized->'lastApiUpdate'->>'at')::bigint <> 1780000000000 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: clamped lastApiUpdate.at must still be recovered from history';
  END IF;
END;
$$;
