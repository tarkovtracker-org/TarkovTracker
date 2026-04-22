-- Keep this persisted cleanup aligned with app/utils/progressSanitizers.ts when
-- changing the canonical stored progress shape.
CREATE OR REPLACE FUNCTION public.sanitize_user_progress_api_task_updates(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.value->>'id',
        'state', entry.value->>'state'
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload) = 'array' THEN payload
      ELSE '[]'::jsonb
    END
  ) AS entry(value)
  WHERE
    jsonb_typeof(entry.value) = 'object'
    AND jsonb_typeof(entry.value->'id') = 'string'
    AND nullif(entry.value->>'id', '') IS NOT NULL
    AND entry.value->>'state' IN ('completed', 'failed', 'uncompleted');
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_api_update_meta(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  WITH sanitized_tasks AS (
    SELECT public.sanitize_user_progress_api_task_updates(payload->'tasks') AS value
  )
  SELECT
    CASE
      WHEN
        jsonb_typeof(payload) = 'object'
        AND payload->>'source' = 'api'
        AND jsonb_typeof(payload->'id') = 'string'
        AND nullif(payload->>'id', '') IS NOT NULL
        AND jsonb_typeof(payload->'at') = 'number'
      THEN jsonb_strip_nulls(
        jsonb_build_object(
          'at',
          to_jsonb(
            greatest(
              0,
              least(
                2147483647,
                greatest(-2147483648, trunc((payload->>'at')::numeric))
              )::int
            )
          ),
          'id', payload->>'id',
          'source', 'api',
          'tasks',
          CASE
            WHEN jsonb_array_length((SELECT value FROM sanitized_tasks)) > 0
            THEN (SELECT value FROM sanitized_tasks)
            ELSE NULL
          END
        )
      )
      ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_api_update_history(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  WITH sanitized_entries AS (
    SELECT public.sanitize_user_progress_api_update_meta(entry.value) AS value
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
    ORDER BY value->>'id', ((value->>'at')::int) DESC
  ),
  ordered_entries AS (
    SELECT value
    FROM deduped_entries
    ORDER BY ((value->>'at')::int) DESC
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
  FROM ordered_entries;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_mode_data(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  WITH sanitized_last_api_update AS (
    SELECT public.sanitize_user_progress_api_update_meta(payload->'lastApiUpdate') AS value
  ),
  sanitized_api_update_history AS (
    SELECT public.sanitize_user_progress_api_update_history(
      CASE
        WHEN (SELECT value FROM sanitized_last_api_update) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              public.sanitize_user_progress_api_update_history(payload->'apiUpdateHistory')
            ) AS entry(value)
            WHERE entry.value->>'id' = (SELECT value->>'id' FROM sanitized_last_api_update)
          )
        THEN jsonb_build_array((SELECT value FROM sanitized_last_api_update))
          || CASE
            WHEN jsonb_typeof(payload->'apiUpdateHistory') = 'array'
            THEN payload->'apiUpdateHistory'
            ELSE '[]'::jsonb
          END
        ELSE payload->'apiUpdateHistory'
      END
    ) AS value
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

DO $$
DECLARE
  sanitized jsonb;
BEGIN
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'displayName',
      '  Cleanup Tester  ',
      'lastApiUpdate',
      jsonb_build_object(
        'at', 90,
        'id', 'update-2',
        'source', 'api',
        'tasks', jsonb_build_array(jsonb_build_object('id', 'task-2', 'state', 'completed'))
      ),
      'level',
      7,
      'pmcFaction',
      'USEC',
      'prestigeLevel',
      2,
      'progressEpoch',
      3,
      'apiUpdateHistory',
      jsonb_build_array(
        jsonb_build_object('at', 100, 'id', 'update-1', 'source', 'api'),
        jsonb_build_object('at', 80, 'id', 'update-2', 'source', 'api'),
        jsonb_build_object(
          'at',
          120,
          'id',
          'update-1',
          'source',
          'api',
          'tasks',
          jsonb_build_array(jsonb_build_object('id', 'task-1', 'state', 'failed'))
        ),
        jsonb_build_object('id', '', 'source', 'api', 'at', 10),
        jsonb_build_object('id', 'update-3', 'source', 'manual', 'at', 70)
      ),
      'skills',
      jsonb_build_object('Endurance', 10),
      'tarkovDevProfile',
      jsonb_build_object('aid', 12345, 'importedAt', 1730000000),
      'taskCompletions',
      jsonb_build_object('task', jsonb_build_object('complete', true))
    )
  );

  IF sanitized->>'displayName' <> 'Cleanup Tester' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: displayName not trimmed as expected';
  END IF;

  IF sanitized ? 'tarkovDevProfile' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: tarkovDevProfile should not be preserved';
  END IF;

  IF sanitized->'skills'->>'Endurance' <> '10' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: in-range skills should be preserved';
  END IF;

  IF sanitized->'lastApiUpdate'->>'id' <> 'update-2' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: lastApiUpdate should be validated and preserved';
  END IF;

  IF sanitized->'apiUpdateHistory'->0->>'id' <> 'update-1' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: apiUpdateHistory should prefer the newest duplicate entry';
  END IF;

  IF sanitized->'apiUpdateHistory'->1->>'id' <> 'update-2' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: apiUpdateHistory should preserve valid entry order';
  END IF;

  IF jsonb_array_length(sanitized->'apiUpdateHistory') <> 2 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: apiUpdateHistory should discard invalid entries';
  END IF;

  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'skills',
      jsonb_build_object('Endurance', 99, 'Strength', -5, 'Intellect', 'bad')
    )
  );

  IF sanitized->'skills'->>'Endurance' <> '51' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: high skill values should be clamped';
  END IF;

  IF sanitized->'skills'->>'Strength' <> '0' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: negative skill values should be clamped';
  END IF;

  IF sanitized->'skills'->>'Intellect' <> '0' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: invalid skill values should normalize to 0';
  END IF;
END;
$$;

DO $$
DECLARE
  rows_updated integer := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT ctid
      FROM public.user_progress
      WHERE
        COALESCE(pvp_data, '{}'::jsonb) ? 'tarkovDevProfile'
        OR COALESCE(pve_data, '{}'::jsonb) ? 'tarkovDevProfile'
      LIMIT 500
    )
    UPDATE public.user_progress AS up
    SET
      pvp_data = public.sanitize_user_progress_mode_data(COALESCE(up.pvp_data, '{}'::jsonb)),
      pve_data = public.sanitize_user_progress_mode_data(COALESCE(up.pve_data, '{}'::jsonb))
    FROM batch
    WHERE up.ctid = batch.ctid;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;
END;
$$;
