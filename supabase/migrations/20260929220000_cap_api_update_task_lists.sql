-- Bound each persisted API update entry to the first 20 valid task updates in input order and
-- record the pre-truncation total as `taskCount` only when entries were dropped. The limit, count
-- clamp, and ordering match `shared/utils/apiTaskUpdates.ts` so client syncs and API writes store
-- identical entries. Replacing these helpers updates lastApiUpdate and apiUpdateHistory
-- sanitization through their existing callers; stored rows shrink on their next write.
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
