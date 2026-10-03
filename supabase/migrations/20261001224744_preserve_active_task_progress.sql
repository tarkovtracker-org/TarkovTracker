-- Preserve explicit task acceptance entries across progress synchronization.
-- Forward function correction only; existing rows are not rewritten.

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_manual_activity_entry(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN
        jsonb_typeof(payload) = 'object'
        AND jsonb_typeof(payload->'id') = 'string'
        AND nullif(btrim(payload->>'id'), '') IS NOT NULL
        AND jsonb_typeof(payload->'title') = 'string'
        AND nullif(btrim(payload->>'title'), '') IS NOT NULL
        AND jsonb_typeof(payload->'timestamp') = 'number'
        AND payload->>'type' IN ('task', 'hideout', 'item', 'system')
        AND payload->>'action' IN (
          'active',
          'complete',
          'uncomplete',
          'fail',
          'reset_failed',
          'upgrade',
          'needed',
          'sync',
          'available'
        )
      THEN jsonb_strip_nulls(
        jsonb_build_object(
          'id', left(btrim(payload->>'id'), 128),
          'timestamp',
          to_jsonb(
            least(
              9007199254740991,
              greatest(0, trunc((payload->>'timestamp')::numeric))
            )::bigint
          ),
          'type', payload->>'type',
          'action', payload->>'action',
          'title', left(btrim(payload->>'title'), 200),
          'details',
          CASE
            WHEN jsonb_typeof(payload->'details') = 'string'
              AND nullif(btrim(payload->>'details'), '') IS NOT NULL
            THEN to_jsonb(left(btrim(payload->>'details'), 300))
            ELSE NULL
          END
        )
      )
      ELSE NULL
    END;
$$;

-- Older clients omit acceptance flags on unchanged tasks during full-mode saves.
-- Keep newer known entries and carry flags on equal-time nonterminal entries.
-- Equal-time terminal and newer legacy status writes retain their precedence.
CREATE OR REPLACE FUNCTION public.carry_task_active_flags(existing jsonb, incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  task_id text;
  task_entry jsonb;
  old_entry jsonb;
  old_timestamp numeric;
  new_timestamp numeric;
  tasks jsonb := incoming->'taskCompletions';
BEGIN
  IF jsonb_typeof(tasks) IS DISTINCT FROM 'object'
    OR jsonb_typeof(existing->'taskCompletions') IS DISTINCT FROM 'object' THEN
    RETURN incoming;
  END IF;
  FOR task_id, task_entry IN SELECT key, value FROM jsonb_each(tasks) LOOP
    old_entry := existing->'taskCompletions'->task_id;
    IF jsonb_typeof(task_entry) IS DISTINCT FROM 'object'
      OR jsonb_typeof(task_entry->'active') = 'boolean'
      OR jsonb_typeof(old_entry->'active') IS DISTINCT FROM 'boolean' THEN
      CONTINUE;
    END IF;
    old_timestamp := CASE WHEN jsonb_typeof(old_entry->'timestamp') = 'number'
      THEN (old_entry->>'timestamp')::numeric ELSE 0 END;
    new_timestamp := CASE WHEN jsonb_typeof(task_entry->'timestamp') = 'number'
      THEN (task_entry->>'timestamp')::numeric ELSE 0 END;
    IF new_timestamp < old_timestamp THEN
      task_entry := old_entry;
    ELSIF task_entry->'complete' = 'true'::jsonb OR task_entry->'failed' = 'true'::jsonb THEN
      task_entry := task_entry || '{"active":false}'::jsonb;
    ELSIF new_timestamp <= old_timestamp
      AND old_entry->'complete' IS DISTINCT FROM 'true'::jsonb
      AND old_entry->'failed' IS DISTINCT FROM 'true'::jsonb THEN
      task_entry := task_entry || jsonb_build_object('active', old_entry->'active');
    END IF;
    tasks := jsonb_set(tasks, ARRAY[task_id], task_entry);
  END LOOP;
  RETURN jsonb_set(incoming, '{taskCompletions}', tasks);
END;
$$;

REVOKE ALL ON FUNCTION public.carry_task_active_flags(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carry_task_active_flags(jsonb, jsonb) TO authenticated, service_role;

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
  RETURN public.carry_task_active_flags(
    existing, public.carry_api_update_task_counts(existing, COALESCE(incoming, '{}'::jsonb))
  )
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
