-- Validate confirmations in batches before choosing between alias and canonical IDs.
-- At most 15 valid entries consume 15 * (64 + 4096) * 4 = 249600 UTF-8 bytes,
-- below the bounded merge's 256 KiB limit. Keep the original values for alias
-- reconciliation, which compares unrounded clocks.
CREATE OR REPLACE FUNCTION private.prepare_task_identity_progress(p_progress jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_availability jsonb := p_progress->'taskAvailability';
BEGIN
  IF jsonb_typeof(v_availability) IS DISTINCT FROM 'object' OR v_availability = '{}'::jsonb THEN
    RETURN p_progress;
  END IF;

  RETURN jsonb_set(p_progress, '{taskAvailability}', (
    SELECT COALESCE(jsonb_object_agg(valid.key, batch.entries->valid.key), '{}'::jsonb)
    FROM (
      SELECT jsonb_object_agg(entry.key, entry.value) AS entries
      FROM (
        SELECT key, value, (row_number() OVER () - 1) / 15 AS batch_number
        FROM jsonb_each(v_availability)
      ) AS entry
      GROUP BY entry.batch_number
    ) AS batch
    CROSS JOIN LATERAL jsonb_object_keys(public.merge_task_availability('{}'::jsonb, batch.entries))
      AS valid(key)
  ));
END;
$$;
