-- Bound per-mode task availability confirmations.
--
-- `merge_task_availability` (20260928140000_preserve_task_availability_confirmations.sql) unions the
-- stored and incoming maps. `sync_user_game_mode_progress` checks only the incoming payload size, so
-- successive same-epoch writes with distinct keys could grow the stored map without limit. The merge
-- now drops entries whose task id exceeds 64 characters or whose requirements exceed 4096 characters,
-- then keeps the newest entries (by confirmation clock, then task id) up to 1000 entries and 256 KiB
-- of task ids plus requirements. Real maps hold a few dozen short signatures, far below every bound.
-- Every sanitizer, sync and progress-row trigger path already runs this helper, so the persisted map
-- is bounded after all merges. Matching client limits: `app/utils/taskAvailabilityConfirmation.ts`.
--
-- Schema-only: no data is rewritten; an oversized stored map is trimmed on its next write.
-- CREATE OR REPLACE keeps existing grants and search_path.

CREATE OR REPLACE FUNCTION public.merge_task_availability(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(kept.key, kept.value), '{}'::jsonb)
  FROM (
    SELECT
      winner.key,
      winner.value,
      row_number() OVER newest AS rank,
      sum(octet_length(winner.key) + octet_length(winner.value->>'requirements')) OVER newest
        AS bytes
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
        AND char_length(entry.key) <= 64
        AND jsonb_typeof(entry.value) = 'object'
        AND jsonb_typeof(entry.value->'requirements') = 'string'
        AND char_length(entry.value->>'requirements') <= 4096
        AND jsonb_typeof(entry.value->'timestamp') = 'number'
        AND (entry.value->>'timestamp')::numeric >= 0
        -- Epoch milliseconds that clients advance with +1: anything after 3000-01-01 is corrupt, and
        -- the cap keeps every successor persistable (MAX_CONFIRMATION_TIMESTAMP on the client).
        AND (entry.value->>'timestamp')::numeric <= 32503680000000
      ORDER BY
        entry.key,
        trunc((entry.value->>'timestamp')::numeric) DESC,
        entry.precedence DESC
    ) AS winner
    WINDOW newest AS (
      ORDER BY (winner.value->>'timestamp')::bigint DESC, winner.key COLLATE "C"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  ) AS kept
  WHERE kept.rank <= 1000
    AND kept.bytes <= 262144;
$$;
