-- Keep explicit acceptance safe when a same-epoch browser save is missing newer task rows.
-- Reset epochs remain authoritative in merge_manual_activity_progress.
CREATE OR REPLACE FUNCTION public.carry_task_active_flags(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  old_tasks jsonb := existing->'taskCompletions';
  tasks jsonb := incoming->'taskCompletions';
  patch jsonb;
BEGIN
  IF jsonb_typeof(incoming) IS DISTINCT FROM 'object'
    OR jsonb_typeof(old_tasks) IS DISTINCT FROM 'object' THEN
    RETURN incoming;
  END IF;
  IF jsonb_typeof(tasks) IS DISTINCT FROM 'object' THEN
    tasks := '{}'::jsonb;
  END IF;

  WITH known_tasks AS (
    SELECT key AS id, value AS old_entry, tasks->key AS new_entry
    FROM jsonb_each(old_tasks)
    WHERE jsonb_typeof(value->'active') = 'boolean'
  ), task_clocks AS (
    SELECT *,
      CASE WHEN jsonb_typeof(old_entry->'timestamp') = 'number'
        THEN (old_entry->>'timestamp')::numeric ELSE 0 END AS old_timestamp,
      CASE WHEN jsonb_typeof(new_entry->'timestamp') = 'number'
        THEN (new_entry->>'timestamp')::numeric ELSE 0 END AS new_timestamp
    FROM known_tasks
  ), reconciled AS (
    SELECT id, CASE
      WHEN jsonb_typeof(new_entry) IS DISTINCT FROM 'object' THEN
        CASE WHEN old_entry->'active' = 'true'::jsonb
          AND old_entry->'complete' IS DISTINCT FROM 'true'::jsonb
          AND old_entry->'failed' IS DISTINCT FROM 'true'::jsonb
          THEN old_entry END
      WHEN new_timestamp < old_timestamp THEN old_entry
      WHEN jsonb_typeof(new_entry->'active') = 'boolean' THEN NULL
      WHEN new_entry->'complete' = 'true'::jsonb OR new_entry->'failed' = 'true'::jsonb
        THEN new_entry || '{"active":false}'::jsonb
      WHEN new_timestamp = old_timestamp
        THEN jsonb_set(new_entry, '{active}', old_entry->'active')
    END AS entry
    FROM task_clocks
  )
  SELECT jsonb_object_agg(id, entry) INTO patch
  FROM reconciled WHERE entry IS NOT NULL;

  IF patch IS NULL THEN
    RETURN incoming;
  END IF;
  RETURN jsonb_set(incoming, '{taskCompletions}', tasks || patch);
END;
$$;
