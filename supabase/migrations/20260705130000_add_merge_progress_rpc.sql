-- Atomic, partial merge of API progress writes.
-- The API gateway previously did GET -> mutate -> PATCH of the whole
-- pvp_data/pve_data JSONB blob, so two concurrent writers (website session,
-- TarkovMonitor, rapid task updates) could silently overwrite each other's
-- changes (lost updates). This RPC merges only the supplied keys in a single
-- UPDATE and reports whether a row was actually updated, so writes against a
-- missing progress row can no longer succeed silently.

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
  IF p_field NOT IN ('pvp_data', 'pve_data') THEN
    RAISE EXCEPTION 'p_field must be pvp_data or pve_data';
  END IF;

  SELECT CASE WHEN p_field = 'pvp_data' THEN pvp_data ELSE pve_data END
    INTO v_data
    FROM public.user_progress
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_data := COALESCE(v_data, '{}'::jsonb);

  IF p_task_completions IS NOT NULL THEN
    v_data := jsonb_set(
      v_data,
      '{taskCompletions}',
      COALESCE(v_data->'taskCompletions', '{}'::jsonb) || p_task_completions
    );
  END IF;

  IF p_task_objectives IS NOT NULL THEN
    v_data := jsonb_set(
      v_data,
      '{taskObjectives}',
      COALESCE(v_data->'taskObjectives', '{}'::jsonb)
    );
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_task_objectives) LOOP
      v_data := jsonb_set(
        v_data,
        ARRAY['taskObjectives', v_key],
        COALESCE(v_data#>ARRAY['taskObjectives', v_key], '{}'::jsonb) || v_value,
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
