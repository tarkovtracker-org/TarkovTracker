-- Atomic, partial merge of API progress writes.
-- The API gateway previously did GET -> mutate -> PATCH of the whole
-- pvp_data/pve_data JSONB blob, so two concurrent writers (website session,
-- TarkovMonitor, rapid task updates) could silently overwrite each other's
-- changes (lost updates). This RPC merges only the supplied keys in a single
-- UPDATE and reports whether a row was actually updated, so writes against a
-- missing progress row can no longer succeed silently.
--
-- DEPLOY ORDER: the api-gateway worker calling this RPC auto-deploys from
-- main via the Cloudflare Git integration. Apply this migration to
-- production (supabase db push --linked) BEFORE merging the worker change,
-- or every API progress write will fail with a missing-RPC error.

CREATE OR REPLACE FUNCTION public.merge_progress_data(
  p_user_id UUID,
  p_field TEXT,
  p_task_completions JSONB DEFAULT NULL,
  p_task_objectives JSONB DEFAULT NULL,
  p_set JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data JSONB;
  v_key TEXT;
  v_value JSONB;
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_field IS NULL OR p_field NOT IN ('pvp_data', 'pve_data') THEN
    RAISE EXCEPTION 'p_field must be pvp_data or pve_data';
  END IF;
  -- jsonb || degrades to array concatenation when an operand is not an
  -- object, which would corrupt the blob; only object params are valid.
  IF p_task_completions IS NOT NULL AND jsonb_typeof(p_task_completions) <> 'object' THEN
    RAISE EXCEPTION 'p_task_completions must be a JSON object';
  END IF;
  IF p_task_objectives IS NOT NULL AND jsonb_typeof(p_task_objectives) <> 'object' THEN
    RAISE EXCEPTION 'p_task_objectives must be a JSON object';
  END IF;
  IF p_set IS NOT NULL AND jsonb_typeof(p_set) <> 'object' THEN
    RAISE EXCEPTION 'p_set must be a JSON object';
  END IF;

  SELECT CASE WHEN p_field = 'pvp_data' THEN pvp_data ELSE pve_data END
    INTO v_data
    FROM public.user_progress
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Normalize JSON null / non-object blobs (COALESCE only covers SQL NULL);
  -- jsonb_set errors on scalar roots and || would array-concatenate.
  IF v_data IS NULL OR jsonb_typeof(v_data) <> 'object' THEN
    v_data := '{}'::jsonb;
  END IF;

  IF p_task_completions IS NOT NULL THEN
    v_data := jsonb_set(
      v_data,
      '{taskCompletions}',
      CASE WHEN jsonb_typeof(v_data->'taskCompletions') = 'object'
           THEN v_data->'taskCompletions' ELSE '{}'::jsonb END || p_task_completions
    );
  END IF;

  IF p_task_objectives IS NOT NULL THEN
    IF jsonb_typeof(v_data->'taskObjectives') IS DISTINCT FROM 'object' THEN
      v_data := jsonb_set(v_data, '{taskObjectives}', '{}'::jsonb);
    END IF;
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_task_objectives) LOOP
      -- Each objective value is deep-merged with || onto the existing entry;
      -- a non-object value would array-concatenate and corrupt the blob, so
      -- reject it loudly (the caller only ever sends objects).
      IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'p_task_objectives values must be JSON objects';
      END IF;
      v_data := jsonb_set(
        v_data,
        ARRAY['taskObjectives', v_key],
        CASE WHEN jsonb_typeof(v_data#>ARRAY['taskObjectives', v_key]) = 'object'
             THEN v_data#>ARRAY['taskObjectives', v_key] ELSE '{}'::jsonb END || v_value,
        true
      );
    END LOOP;
  END IF;

  IF p_set IS NOT NULL THEN
    v_data := v_data || p_set;
  END IF;

  IF p_field = 'pvp_data' THEN
    UPDATE public.user_progress SET pvp_data = v_data WHERE user_id = p_user_id;
  ELSE
    UPDATE public.user_progress SET pve_data = v_data WHERE user_id = p_user_id;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  TO service_role;
