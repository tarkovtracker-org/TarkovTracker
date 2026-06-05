-- Fix "Recent Sync History" showing 1970 dates.
--
-- The API gateway writes apiUpdateHistory/lastApiUpdate `at` as a millisecond
-- epoch (Date.now(), ~1.78e12). Earlier sanitizers clamped `at` to a 32-bit
-- signed int (least(2147483647, ...)::int), capping every real timestamp at
-- 2147483647 ms = 1970-01-25T20:31:23Z. `at` is a millisecond epoch and must be
-- treated as a non-negative bigint, matching app/utils/progressSanitizers.ts
-- (Math.max(0, Math.trunc(at))).

-- Recreate the API update meta sanitizer without the int32 clamp on `at`.
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
            least(9223372036854775807, greatest(0, trunc((payload->>'at')::numeric)))::bigint
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

-- Recreate the history sanitizer with bigint ordering (int casts overflow once
-- `at` exceeds 2147483647).
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
    ORDER BY value->>'id', ((value->>'at')::bigint) DESC
  ),
  ordered_entries AS (
    SELECT value
    FROM deduped_entries
    ORDER BY ((value->>'at')::bigint) DESC
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
  FROM ordered_entries;
$$;

-- Recreate the merge trigger helper without the int32 clamp on `at`.
CREATE OR REPLACE FUNCTION public.merge_api_update_history(
  payload jsonb,
  previous_payload jsonb,
  max_entries integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
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
      END AS tasks
    FROM candidate_entries
    WHERE jsonb_typeof(value) = 'object'
      AND value->>'source' = 'api'
  ),
  deduped_entries AS (
    SELECT DISTINCT ON (id)
      id,
      at,
      tasks
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
          'tasks', tasks
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

-- One-time recovery helpers for rows whose `at` was already clamped to the
-- int32 sentinel (2147483647). The worker stamps every task touched by a sync
-- with the same updateTime it stored in `at`, so the real millisecond value can
-- be recovered from taskCompletions; otherwise fall back to the row timestamp.
CREATE OR REPLACE FUNCTION public.fix_recover_api_update_meta_at(
  entry jsonb,
  task_completions jsonb,
  fallback_ms bigint
)
RETURNS bigint
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT least(
        9223372036854775807::numeric,
        max((task_completions -> (task.value->>'id') ->> 'timestamp')::numeric)
      )::bigint
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(entry->'tasks') = 'array' THEN entry->'tasks'
          ELSE '[]'::jsonb
        END
      ) AS task(value)
      WHERE jsonb_typeof(task.value->'id') = 'string'
        AND jsonb_typeof(task_completions -> (task.value->>'id') -> 'timestamp') = 'number'
        AND (task_completions -> (task.value->>'id') ->> 'timestamp')::numeric > 2147483647
      HAVING max((task_completions -> (task.value->>'id') ->> 'timestamp')::numeric) IS NOT NULL
    ),
    fallback_ms
  );
$$;

CREATE OR REPLACE FUNCTION public.fix_recover_api_update_history_timestamps(
  payload jsonb,
  fallback_ms bigint
)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  WITH completions AS (
    SELECT CASE
      WHEN jsonb_typeof(payload->'taskCompletions') = 'object'
      THEN payload->'taskCompletions'
      ELSE '{}'::jsonb
    END AS value
  ),
  fixed_history AS (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(entry.value->'at') = 'number'
            AND (entry.value->>'at')::numeric = 2147483647
          THEN jsonb_set(
            entry.value,
            '{at}',
            to_jsonb(public.fix_recover_api_update_meta_at(
              entry.value,
              (SELECT value FROM completions),
              fallback_ms
            ))
          )
          ELSE entry.value
        END
        ORDER BY entry.ordinality
      ),
      '[]'::jsonb
    ) AS value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'apiUpdateHistory') = 'array'
        THEN payload->'apiUpdateHistory'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS entry(value, ordinality)
  ),
  fixed_last AS (
    SELECT CASE
      WHEN jsonb_typeof(payload->'lastApiUpdate'->'at') = 'number'
        AND (payload->'lastApiUpdate'->>'at')::numeric = 2147483647
      THEN jsonb_set(
        payload->'lastApiUpdate',
        '{at}',
        to_jsonb(public.fix_recover_api_update_meta_at(
          payload->'lastApiUpdate',
          (SELECT value FROM completions),
          fallback_ms
        ))
      )
      ELSE payload->'lastApiUpdate'
    END AS value
  )
  SELECT
    CASE
      WHEN jsonb_typeof(payload->'lastApiUpdate') = 'object'
      THEN jsonb_set(
        jsonb_set(payload, '{apiUpdateHistory}', (SELECT value FROM fixed_history), true),
        '{lastApiUpdate}',
        (SELECT value FROM fixed_last),
        true
      )
      ELSE jsonb_set(
        payload,
        '{apiUpdateHistory}',
        (SELECT value FROM fixed_history),
        true
      )
    END;
$$;

CREATE OR REPLACE FUNCTION public.fix_api_update_history_needs_recovery(payload jsonb)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT
    (
      jsonb_typeof(payload->'lastApiUpdate'->'at') = 'number'
      AND (payload->'lastApiUpdate'->>'at')::numeric = 2147483647
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(payload->'apiUpdateHistory') = 'array'
          THEN payload->'apiUpdateHistory'
          ELSE '[]'::jsonb
        END
      ) AS entry(value)
      WHERE jsonb_typeof(entry.value->'at') = 'number'
        AND (entry.value->>'at')::numeric = 2147483647
    );
$$;

-- Regression coverage for the clamp fix and the recovery helpers.
DO $$
DECLARE
  sanitized jsonb;
  merged jsonb;
  recovered jsonb;
BEGIN
  sanitized := public.sanitize_user_progress_api_update_meta(
    jsonb_build_object('id', 'meta-1', 'source', 'api', 'at', 1780000000000::bigint)
  );

  IF (sanitized->>'at')::bigint <> 1780000000000 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_api_update_meta regression: millisecond at must not be clamped';
  END IF;

  -- Oversized/hostile `at` must clamp to the bigint ceiling instead of raising
  -- `bigint out of range` and aborting the write.
  sanitized := public.sanitize_user_progress_api_update_meta(
    jsonb_build_object('id', 'meta-2', 'source', 'api', 'at', 1e40::numeric)
  );

  IF (sanitized->>'at')::bigint <> 9223372036854775807 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_api_update_meta regression: oversized at must clamp to bigint ceiling';
  END IF;

  merged := public.merge_api_update_history(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'newer', 'source', 'api', 'at', 1780000000001::bigint)
    ),
    jsonb_build_object(
      'apiUpdateHistory',
      jsonb_build_array(
        jsonb_build_object('id', 'older', 'source', 'api', 'at', 1780000000000::bigint)
      )
    ),
    50
  );

  IF (merged->0->>'id') <> 'newer' OR (merged->0->>'at')::bigint <> 1780000000001 THEN
    RAISE EXCEPTION
      'merge_api_update_history regression: millisecond at must survive merge and order newest first';
  END IF;

  merged := public.merge_api_update_history(
    jsonb_build_object(
      'lastApiUpdate',
      jsonb_build_object('id', 'huge', 'source', 'api', 'at', 1e40::numeric)
    ),
    '{}'::jsonb,
    50
  );

  IF (merged->0->>'at')::bigint <> 9223372036854775807 THEN
    RAISE EXCEPTION
      'merge_api_update_history regression: oversized at must clamp to bigint ceiling';
  END IF;

  recovered := public.fix_recover_api_update_history_timestamps(
    jsonb_build_object(
      'taskCompletions',
      jsonb_build_object(
        'task-1', jsonb_build_object('complete', true, 'timestamp', 1780000000500::bigint)
      ),
      'lastApiUpdate',
      jsonb_build_object(
        'id', 'clamped',
        'source', 'api',
        'at', 2147483647,
        'tasks', jsonb_build_array(jsonb_build_object('id', 'task-1', 'state', 'completed'))
      ),
      'apiUpdateHistory',
      jsonb_build_array(
        jsonb_build_object(
          'id', 'clamped',
          'source', 'api',
          'at', 2147483647,
          'tasks', jsonb_build_array(jsonb_build_object('id', 'task-1', 'state', 'completed'))
        ),
        jsonb_build_object('id', 'no-tasks', 'source', 'api', 'at', 2147483647)
      )
    ),
    1780000009999::bigint
  );

  IF (recovered->'lastApiUpdate'->>'at')::bigint <> 1780000000500 THEN
    RAISE EXCEPTION
      'fix_recover_api_update_history_timestamps regression: lastApiUpdate at should recover from taskCompletions';
  END IF;

  IF (recovered->'apiUpdateHistory'->0->>'at')::bigint <> 1780000000500 THEN
    RAISE EXCEPTION
      'fix_recover_api_update_history_timestamps regression: history at should recover from taskCompletions';
  END IF;

  IF (recovered->'apiUpdateHistory'->1->>'at')::bigint <> 1780000009999 THEN
    RAISE EXCEPTION
      'fix_recover_api_update_history_timestamps regression: history at should fall back to row timestamp';
  END IF;
END;
$$;

-- Repair already-clamped rows in place. Functions above are already fixed, so
-- the BEFORE triggers preserve the recovered millisecond values.
DO $$
DECLARE
  rows_updated integer := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT user_id
      FROM public.user_progress
      WHERE
        public.fix_api_update_history_needs_recovery(COALESCE(pvp_data, '{}'::jsonb))
        OR public.fix_api_update_history_needs_recovery(COALESCE(pve_data, '{}'::jsonb))
      LIMIT 500
    )
    UPDATE public.user_progress AS up
    SET
      pvp_data = public.fix_recover_api_update_history_timestamps(
        COALESCE(up.pvp_data, '{}'::jsonb),
        (extract(epoch FROM COALESCE(up.updated_at, now())) * 1000)::bigint
      ),
      pve_data = public.fix_recover_api_update_history_timestamps(
        COALESCE(up.pve_data, '{}'::jsonb),
        (extract(epoch FROM COALESCE(up.updated_at, now())) * 1000)::bigint
      )
    FROM batch
    WHERE up.user_id = batch.user_id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.fix_api_update_history_needs_recovery(jsonb);
DROP FUNCTION IF EXISTS public.fix_recover_api_update_history_timestamps(jsonb, bigint);
DROP FUNCTION IF EXISTS public.fix_recover_api_update_meta_at(jsonb, jsonb, bigint);
