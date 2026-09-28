-- Persist per-mode task availability confirmations.
--
-- `taskAvailability` records a player's in-game confirmation of a task's server-side start gates,
-- keyed by task id as `{ requirements, timestamp }`. It is stored apart from `taskCompletions` so
-- confirming or clearing it never rewrites task status; a clear is an empty `requirements` string
-- kept as a tombstone.
--
-- * `merge_task_availability` resolves each task by the confirmation timestamp.
-- * `merge_manual_activity_progress`, which both progress-row triggers already run against the stored
--   row inside the write, now also merges this map, so a stale client or a pre-deployment bundle that
--   omits the key cannot drop confirmations or clears written by another device. Its body is
--   otherwise identical to 20260910055448_harden_manual_activity_history_sync.sql.
-- * `sanitize_user_progress_mode_data` keeps only well-formed entries; its body is otherwise identical
--   to the same earlier migration.
--
-- Schema-only: no data is rewritten. CREATE OR REPLACE keeps existing grants and search_path; the new
-- helper gets the same grants as `merge_manual_activity_progress`. Readers treat a missing key as no
-- confirmations.

-- Per-task last-write-wins merge of availability confirmations on their own clock. Malformed entries
-- are dropped; on a timestamp tie the incoming entry wins, matching the client merge. A missing or
-- non-object side contributes nothing, so a payload without the key keeps the stored map.
CREATE OR REPLACE FUNCTION public.merge_task_availability(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(winner.key, winner.value), '{}'::jsonb)
  FROM (
    SELECT DISTINCT ON (entry.key)
      entry.key,
      jsonb_build_object(
        'requirements', entry.value->'requirements',
        'timestamp', to_jsonb(trunc((entry.value->>'timestamp')::numeric)::bigint)
      ) AS value
    FROM (
      SELECT side.key, side.value, 0 AS precedence
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(existing) = 'object' THEN existing ELSE '{}'::jsonb END
      ) AS side
      UNION ALL
      SELECT side.key, side.value, 1 AS precedence
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(incoming) = 'object' THEN incoming ELSE '{}'::jsonb END
      ) AS side
    ) AS entry
    WHERE entry.key <> ''
      AND jsonb_typeof(entry.value) = 'object'
      AND jsonb_typeof(entry.value->'requirements') = 'string'
      AND jsonb_typeof(entry.value->'timestamp') = 'number'
      AND (entry.value->>'timestamp')::numeric >= 0
      -- Epoch milliseconds that clients advance with +1: anything after 3000-01-01 is corrupt, and
      -- the cap keeps every successor persistable (MAX_CONFIRMATION_TIMESTAMP on the client).
      AND (entry.value->>'timestamp')::numeric <= 32503680000000
    ORDER BY
      entry.key,
      trunc((entry.value->>'timestamp')::numeric) DESC,
      entry.precedence DESC
  ) AS winner;
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
    'manualActivityHistory', public.sanitize_user_progress_manual_activity_history(history),
    'taskAvailability', public.merge_task_availability(
      existing->'taskAvailability',
      incoming->'taskAvailability'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_task_availability(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_task_availability(jsonb, jsonb) TO authenticated, service_role;
