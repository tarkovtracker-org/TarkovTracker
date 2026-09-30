-- Bound each persisted API update entry to the first 20 valid task updates in input order and
-- record the pre-truncation total as `taskCount` only when entries were dropped. The limit, count
-- clamp, and ordering match `shared/utils/apiTaskUpdates.ts` so client syncs and API writes store
-- identical entries. Replacing these helpers updates lastApiUpdate and apiUpdateHistory
-- sanitization through their existing callers; stored rows shrink on their next write. The legacy
-- user_progress history trigger rebuilds entries through merge_api_update_history before the row
-- sanitizer runs, so it must carry taskCount through for the sanitizer to keep it. Clients built
-- before this change resend capped entries without taskCount, so both history merges keep the
-- largest count already stored for the same entry id and timestamp.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_api_task_updates(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.value->>'id',
        'state', entry.value->>'state'
      )
      ORDER BY entry.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload) = 'array' THEN payload
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS entry(value, ordinality)
  WHERE
    jsonb_typeof(entry.value) = 'object'
    AND jsonb_typeof(entry.value->'id') = 'string'
    AND nullif(entry.value->>'id', '') IS NOT NULL
    AND entry.value->>'state' IN ('completed', 'failed', 'uncompleted', 'active');
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_api_update_meta(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  WITH valid_tasks AS (
    SELECT public.sanitize_user_progress_api_task_updates(payload->'tasks') AS value
  ),
  capped_tasks AS (
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(task.value ORDER BY task.ordinality)
          FROM jsonb_array_elements(valid.value) WITH ORDINALITY AS task(value, ordinality)
          WHERE task.ordinality <= 20
        ),
        '[]'::jsonb
      ) AS tasks,
      greatest(
        jsonb_array_length(valid.value),
        CASE
          WHEN jsonb_typeof(payload->'taskCount') = 'number'
          THEN least(1000000, greatest(0, trunc((payload->>'taskCount')::numeric)))::integer
          ELSE 0
        END
      ) AS total
    FROM valid_tasks AS valid
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
            least(9223372036854775807, greatest(0, trunc((payload->>'at')::numeric)))::bigint
          ),
          'id', payload->>'id',
          'source', 'api',
          'tasks',
          CASE
            WHEN jsonb_array_length(capped.tasks) > 0 THEN capped.tasks
            ELSE NULL
          END,
          'taskCount',
          CASE
            WHEN capped.total > jsonb_array_length(capped.tasks) THEN to_jsonb(capped.total)
            ELSE NULL
          END
        )
      )
      ELSE NULL
    END
  FROM capped_tasks AS capped;
$$;

CREATE OR REPLACE FUNCTION public.merge_api_update_history(
  payload jsonb,
  previous_payload jsonb,
  max_entries integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  WITH candidate_entries AS (
    SELECT value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'apiUpdateHistory') = 'array'
        THEN payload->'apiUpdateHistory'
        ELSE '[]'::jsonb
      END
    )
    UNION ALL
    SELECT payload->'lastApiUpdate'
    WHERE jsonb_typeof(payload->'lastApiUpdate') = 'object'
    UNION ALL
    SELECT value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(previous_payload->'apiUpdateHistory') = 'array'
        THEN previous_payload->'apiUpdateHistory'
        ELSE '[]'::jsonb
      END
    )
    UNION ALL
    SELECT previous_payload->'lastApiUpdate'
    WHERE jsonb_typeof(previous_payload->'lastApiUpdate') = 'object'
  ),
  normalized_entries AS (
    SELECT
      left(nullif(btrim(value->>'id'), ''), 64) AS id,
      CASE
        WHEN jsonb_typeof(value->'at') = 'number'
        THEN least(9223372036854775807, greatest(0, trunc((value->>'at')::numeric)))::bigint
        ELSE NULL
      END AS at,
      CASE
        WHEN jsonb_typeof(value->'tasks') = 'array'
        THEN value->'tasks'
        ELSE NULL
      END AS tasks,
      CASE
        WHEN jsonb_typeof(value->'taskCount') = 'number'
        THEN (value->>'taskCount')::numeric
        ELSE NULL
      END AS task_count
    FROM candidate_entries
    WHERE jsonb_typeof(value) = 'object'
      AND value->>'source' = 'api'
  ),
  deduped_entries AS (
    SELECT DISTINCT ON (id)
      id,
      at,
      tasks,
      max(task_count) OVER (PARTITION BY id, at) AS task_count
    FROM normalized_entries
    WHERE id IS NOT NULL
      AND at IS NOT NULL
    ORDER BY id, at DESC
  ),
  ordered_entries AS (
    SELECT
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', id,
          'at', at,
          'source', 'api',
          'tasks', tasks,
          'taskCount', task_count
        )
      ) AS entry,
      at
    FROM deduped_entries
    ORDER BY at DESC
    LIMIT greatest(1, least(500, max_entries))
  )
  SELECT COALESCE(jsonb_agg(entry ORDER BY at DESC), '[]'::jsonb)
  FROM ordered_entries;
$$;

CREATE OR REPLACE FUNCTION public.carry_api_update_task_count(entry jsonb, existing jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN known.task_count IS NULL THEN entry
      ELSE entry || jsonb_build_object('taskCount', known.task_count)
    END
  FROM (
    SELECT max((candidate.value->>'taskCount')::numeric) AS task_count
    FROM (
      SELECT value
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(existing->'apiUpdateHistory') = 'array'
          THEN existing->'apiUpdateHistory'
          ELSE '[]'::jsonb
        END
      )
      UNION ALL
      SELECT existing->'lastApiUpdate'
    ) AS candidate
    WHERE jsonb_typeof(entry) = 'object'
      AND jsonb_typeof(candidate.value) = 'object'
      AND jsonb_typeof(candidate.value->'taskCount') = 'number'
      AND candidate.value->'id' = entry->'id'
      AND candidate.value->'at' = entry->'at'
      AND (candidate.value->>'taskCount')::numeric > CASE
        WHEN jsonb_typeof(entry->'taskCount') = 'number' THEN (entry->>'taskCount')::numeric
        ELSE 0
      END
  ) AS known;
$$;

CREATE OR REPLACE FUNCTION public.carry_api_update_task_counts(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT incoming
    || CASE
      WHEN jsonb_typeof(incoming->'lastApiUpdate') = 'object'
      THEN jsonb_build_object(
        'lastApiUpdate',
        public.carry_api_update_task_count(incoming->'lastApiUpdate', existing)
      )
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN jsonb_typeof(incoming->'apiUpdateHistory') = 'array'
      THEN jsonb_build_object(
        'apiUpdateHistory',
        (
          SELECT COALESCE(
            jsonb_agg(
              public.carry_api_update_task_count(entry.value, existing)
              ORDER BY entry.ordinality
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(incoming->'apiUpdateHistory') WITH ORDINALITY
            AS entry(value, ordinality)
        )
      )
      ELSE '{}'::jsonb
    END;
$$;

REVOKE ALL ON FUNCTION public.carry_api_update_task_count(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carry_api_update_task_counts(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carry_api_update_task_count(jsonb, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carry_api_update_task_counts(jsonb, jsonb)
  TO authenticated, service_role;

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
