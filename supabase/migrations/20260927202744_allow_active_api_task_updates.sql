-- The API can report `active` for an accepted task while its objectives are in progress.
-- Keep the persisted sanitizer aligned with the public task-state contract. Replacing this
-- helper updates lastApiUpdate and apiUpdateHistory sanitization through their existing callers;
-- it does not rewrite stored progress rows.
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
    AND entry.value->>'state' IN ('completed', 'failed', 'uncompleted', 'active');
$$;
