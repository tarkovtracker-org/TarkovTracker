-- Reconcile a stale/clamped lastApiUpdate.at against apiUpdateHistory.
--
-- After the int32 clamp fix (20260605120000) the at-rest data was repaired, but
-- clients that cached a pre-fix lastApiUpdate (at = 2147483647, the 1970 int32
-- sentinel) keep re-pushing it on sync. The DB sanitizer accepts 2147483647 as
-- a valid non-negative bigint, so the clamped value survives in the standalone
-- lastApiUpdate field even though apiUpdateHistory holds the same entry id with
-- the correct millisecond at.
--
-- Fix it at the source that runs on every write: sanitize_user_progress_mode_data
-- (invoked by the sanitize_user_progress_payload BEFORE trigger). After building
-- the sanitized history, adopt the history entry's at for the same id whenever it
-- is larger than the incoming lastApiUpdate.at. This is self-healing -- any client
-- re-pushing a stale clamped value is corrected server-side -- and idempotent for
-- already-correct rows.
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
  -- Reconcile lastApiUpdate.at with the matching history entry. The history
  -- sanitizer already keeps the largest at per id, so a clamped lastApiUpdate
  -- (e.g. the 2147483647 sentinel) is corrected to the real millisecond value
  -- whenever the same id is present in history with a larger at.
  -- at of the matching history entry for the same id, if any. NULL when the id
  -- is absent from the sanitized history (e.g. trimmed by its LIMIT). Computed
  -- as a standalone scalar so a zero-row match cannot null out lastApiUpdate.
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

-- Regression coverage for the reconciliation and for the unaffected paths.
DO $$
DECLARE
  sanitized jsonb;
BEGIN
  -- A clamped lastApiUpdate.at is corrected from the matching history entry.
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
      'sanitize_user_progress_mode_data regression: clamped lastApiUpdate.at must be recovered from history';
  END IF;

  -- A correct lastApiUpdate.at is preserved (history is not newer).
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'sync-2', 'source', 'api', 'at', 1780000000900::bigint),
      'apiUpdateHistory',
      jsonb_build_array(
        jsonb_build_object('id', 'sync-2', 'source', 'api', 'at', 1780000000900::bigint)
      )
    )
  );

  IF (sanitized->'lastApiUpdate'->>'at')::bigint <> 1780000000900 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: correct lastApiUpdate.at must be preserved';
  END IF;

  -- lastApiUpdate with no matching history id is left as-is (still added to history).
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'orphan', 'source', 'api', 'at', 1780000001234::bigint)
    )
  );

  IF (sanitized->'lastApiUpdate'->>'at')::bigint <> 1780000001234 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: orphan lastApiUpdate.at must be preserved';
  END IF;

  IF (sanitized->'apiUpdateHistory'->0->>'id') <> 'orphan' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: orphan lastApiUpdate must be folded into history';
  END IF;

  -- Edge case: lastApiUpdate.id is older than the top 50 history entries, so the
  -- history sanitizer's LIMIT trims it out. lastApiUpdate must still be preserved
  -- (a zero-row history match must not null it out).
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'older-than-50', 'source', 'api', 'at', 1000000000000::bigint),
      'apiUpdateHistory',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', 'newer-' || gs::text,
            'source', 'api',
            'at', (1780000000000::bigint + gs)
          )
        )
        FROM generate_series(1, 60) AS gs
      )
    )
  );

  IF sanitized->'lastApiUpdate' IS NULL OR sanitized->'lastApiUpdate' = 'null'::jsonb THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: lastApiUpdate must survive when its id is trimmed from history';
  END IF;

  IF (sanitized->'lastApiUpdate'->>'at')::bigint <> 1000000000000 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: trimmed-id lastApiUpdate.at must be preserved unchanged';
  END IF;
END;
$$;

-- One-time repair: re-sanitize rows whose stored lastApiUpdate.at is still the
-- int32 sentinel. The recreated function above reconciles it from history, and
-- the BEFORE trigger persists the corrected value. statement_timeout is lifted
-- for the maintenance step (a DO-block loop counts as one statement and the
-- table can be large); RESET restores the default afterward.
SET statement_timeout = 0;

UPDATE public.user_progress AS up
SET
  pvp_data = public.sanitize_user_progress_mode_data(COALESCE(up.pvp_data, '{}'::jsonb)),
  pve_data = public.sanitize_user_progress_mode_data(COALESCE(up.pve_data, '{}'::jsonb))
WHERE
  (up.pvp_data->'lastApiUpdate'->>'at') = '2147483647'
  OR (up.pve_data->'lastApiUpdate'->>'at') = '2147483647';

RESET statement_timeout;
