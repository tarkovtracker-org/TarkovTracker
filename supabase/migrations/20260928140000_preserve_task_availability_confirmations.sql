-- Preserve per-mode task availability confirmations through the progress sanitizer.
--
-- `taskAvailability` records a player's in-game confirmation of a task's server-side start gates,
-- keyed by task id as `{ requirements, timestamp }`. It is stored apart from `taskCompletions` so
-- confirming or clearing it never rewrites task status; clients merge it per task by its own
-- timestamp. Without this, the row sanitizer drops the key on every write.
--
-- Additive and schema-only: the function body is identical to the previous definition in
-- 20260910055448_harden_manual_activity_history_sync.sql apart from the new key. CREATE OR REPLACE
-- keeps the existing EXECUTE grants and search_path. No data is rewritten; rows gain the key on
-- their next write, and readers treat a missing key as no confirmations.

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
      CASE
        WHEN jsonb_typeof(payload->'taskAvailability') = 'object'
        THEN payload->'taskAvailability'
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
