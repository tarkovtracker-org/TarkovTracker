-- #1302: trusted identity support ships empty, before any catalog cutover. No backfill.
-- Future activation replaces only this ledger from the reviewed overlay manifest.
CREATE FUNCTION private.progress_task_id_aliases()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '{"schemaVersion":1,"modes":{"regular":{"tasks":{},"objectives":{}},"pve":{"tasks":{},"objectives":{}},"pvp-season":{"tasks":{},"objectives":{}}}}'::jsonb;
$$;
REVOKE ALL ON FUNCTION private.progress_task_id_aliases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.progress_task_id_aliases() TO service_role;

CREATE FUNCTION public.get_progress_task_id_aliases()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.progress_task_id_aliases();
$$;
REVOKE ALL ON FUNCTION public.get_progress_task_id_aliases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress_task_id_aliases() TO service_role;

CREATE FUNCTION private.task_identity_clock(p_value jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value->'timestamp') = 'number' THEN
    CASE WHEN (p_value->>'timestamp')::numeric BETWEEN 0 AND 1.7976931348623157e308
      THEN (p_value->>'timestamp')::numeric END
  END;
$$;

-- Right is the current copy within an identity, or the canonical identity within a family.
-- Unknown clocks cannot establish order; they never make an alias beat a canonical record.
CREATE FUNCTION private.merge_task_identity_record(p_left jsonb, p_right jsonb, p_partial boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_winner jsonb := p_right;
  v_loser jsonb := p_left;
  v_result jsonb;
BEGIN
  IF p_left IS NULL THEN RETURN p_right; END IF;
  IF p_right IS NULL THEN RETURN p_left; END IF;
  IF private.task_identity_clock(p_left) > private.task_identity_clock(p_right) THEN
    v_winner := p_left;
    v_loser := p_right;
  END IF;
  IF NOT p_partial OR jsonb_typeof(v_winner) <> 'object' THEN RETURN v_winner; END IF;
  v_result := (CASE WHEN jsonb_typeof(v_loser) = 'object' THEN v_loser ELSE '{}'::jsonb END) || v_winner;
  IF NOT v_winner ? 'timestamp' THEN v_result := v_result - 'timestamp'; END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION private.reconcile_task_identity_map(
  p_current jsonb, p_previous jsonb, p_aliases jsonb, p_partial boolean
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_result jsonb := p_current;
  v_source text;
  v_target text;
  v_alias jsonb;
  v_canonical jsonb;
  v_value jsonb;
BEGIN
  FOR v_source, v_target IN SELECT key, value FROM jsonb_each_text(p_aliases) LOOP
    v_alias := private.merge_task_identity_record(p_previous->v_source, p_current->v_source, p_partial);
    v_canonical := private.merge_task_identity_record(p_previous->v_target, p_current->v_target, p_partial);
    v_value := private.merge_task_identity_record(v_alias, v_canonical, p_partial);
    IF v_value IS NULL THEN CONTINUE; END IF;
    IF jsonb_typeof(v_result) IS DISTINCT FROM 'object' THEN v_result := '{}'::jsonb; END IF;
    v_result := jsonb_set(v_result - v_source, ARRAY[v_target], v_value, true);
  END LOOP;
  RETURN v_result;
END;
$$;

-- Pure parity counterpart of progress-contracts/taskIdAliases. Only trigger-owned trusted maps
-- reach persistence; this argument-bearing helper is not executable by API or browser roles.
CREATE FUNCTION private.reconcile_task_identity_progress(
  p_current jsonb, p_previous jsonb, p_game_mode text, p_manifest jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_mode text;
  v_mapping jsonb;
  v_objectives jsonb;
  v_field text;
  v_aliases jsonb;
  v_value jsonb;
  v_previous jsonb := p_previous;
  v_result jsonb := p_current;
BEGIN
  v_mode := CASE p_game_mode WHEN 'pvp' THEN 'regular' WHEN 'pve' THEN 'pve' WHEN 'seasonal' THEN 'pvp-season' END;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Invalid identity game mode'; END IF;
  IF jsonb_typeof(p_current) IS DISTINCT FROM 'object' THEN RETURN p_current; END IF;
  v_mapping := p_manifest->'modes'->v_mode;
  IF public.sanitize_manual_activity_epoch(p_current->'progressEpoch')
      IS DISTINCT FROM public.sanitize_manual_activity_epoch(p_previous->'progressEpoch') THEN
    v_previous := NULL;
  END IF;
  SELECT COALESCE(jsonb_object_agg(key, value->'id'), '{}'::jsonb) INTO v_objectives
    FROM jsonb_each(v_mapping->'objectives');
  FOREACH v_field IN ARRAY ARRAY['taskCompletions', 'taskObjectives', 'taskAvailability'] LOOP
    v_aliases := CASE WHEN v_field = 'taskObjectives' THEN v_objectives ELSE v_mapping->'tasks' END;
    v_value := private.reconcile_task_identity_map(p_current->v_field, v_previous->v_field, v_aliases, v_field = 'taskObjectives');
    IF v_value IS NOT NULL THEN v_result := jsonb_set(v_result, ARRAY[v_field], v_value); END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

-- Reconcile before the existing bounded availability merge, which must never spend two slots
-- on an alias family or reintroduce a stored placeholder. Existing reset/history rules still win.
CREATE FUNCTION private.merge_task_identity_progress(p_existing jsonb, p_incoming jsonb, p_mode text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.merge_manual_activity_progress(
    private.reconcile_task_identity_progress(p_existing, NULL, p_mode, private.progress_task_id_aliases()),
    private.reconcile_task_identity_progress(p_incoming, p_existing, p_mode, private.progress_task_id_aliases())
  );
$$;
REVOKE ALL ON FUNCTION private.merge_task_identity_progress(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.merge_task_identity_progress(jsonb, jsonb, text) TO service_role;

-- BEFORE UPDATE sees OLD under the row lock, including ON CONFLICT updates. Do not re-key in
-- BEFORE INSERT: PostgreSQL would copy those keys into EXCLUDED and erase their alias origin
-- before comparing them with an existing canonical record. A fresh INSERT is normalized by an
-- AFTER INSERT update within the same transaction instead; other transactions never see it raw.
CREATE FUNCTION private.reconcile_task_identities_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_previous jsonb;
  v_canonical jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_previous := OLD.progress_data; END IF;
  v_canonical := private.reconcile_task_identity_progress(
    NEW.progress_data, v_previous, NEW.game_mode, private.progress_task_id_aliases()
  );
  IF TG_OP = 'UPDATE' THEN
    NEW.progress_data := v_canonical;
    RETURN NEW;
  END IF;
  IF v_canonical IS NOT DISTINCT FROM NEW.progress_data THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'user_game_mode_progress' THEN
    UPDATE public.user_game_mode_progress SET progress_data = v_canonical
      WHERE user_id = NEW.user_id AND game_mode = NEW.game_mode AND season_number = NEW.season_number;
  ELSE
    UPDATE public.user_profile_mode_progress SET progress_data = v_canonical
      WHERE profile_id = NEW.profile_id AND game_mode = NEW.game_mode AND season_number = NEW.season_number;
  END IF;
  RETURN NEW;
END;
$$;

-- aa_ resolves raw alias provenance before row preparation. The preparation function below
-- canonicalizes both inputs before its bounded availability merge, so aliases cannot return.
CREATE TRIGGER aa_reconcile_task_identities_update BEFORE UPDATE OF progress_data
  ON public.user_game_mode_progress FOR EACH ROW EXECUTE FUNCTION private.reconcile_task_identities_on_write();
CREATE TRIGGER reconcile_task_identities_insert AFTER INSERT
  ON public.user_game_mode_progress FOR EACH ROW EXECUTE FUNCTION private.reconcile_task_identities_on_write();
CREATE TRIGGER aa_reconcile_task_identities_update BEFORE UPDATE OF progress_data
  ON public.user_profile_mode_progress FOR EACH ROW EXECUTE FUNCTION private.reconcile_task_identities_on_write();
CREATE TRIGGER reconcile_task_identities_insert AFTER INSERT
  ON public.user_profile_mode_progress FOR EACH ROW EXECUTE FUNCTION private.reconcile_task_identities_on_write();

REVOKE ALL ON FUNCTION private.task_identity_clock(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.merge_task_identity_record(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_task_identity_map(jsonb, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_task_identity_progress(jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_task_identities_on_write() FROM PUBLIC, anon, authenticated, service_role;

-- Preserve current RPC bodies, signatures, grants, locking, authorization and seasonal guards;
-- only route their pre-persistence merge through the mode-aware identity boundary.
CREATE OR REPLACE FUNCTION private.sync_user_game_mode_progress(p_current_game_mode text, p_game_edition integer, p_tarkov_uid bigint, p_modes jsonb, p_seasonal_season_number smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_mode TEXT;
  v_pvp_mode CONSTANT TEXT := 'pvp';
  v_pve_mode CONSTANT TEXT := 'pve';
  v_seasonal_mode CONSTANT TEXT := 'seasonal';
  v_empty_object CONSTANT JSONB := '{}'::jsonb;
  v_progress JSONB;
  v_existing_mode JSONB;
  v_season_number SMALLINT;
  v_active_season SMALLINT := private.active_season_number();
  v_rate_allowed BOOLEAN;
  v_stored_uid BIGINT;
  v_uid_conflict BOOLEAN := false;
  v_constraint TEXT;
  v_rows_changed INTEGER;
  v_persistent_changed BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_game_mode IS NULL
    OR p_current_game_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;
  IF pg_column_size(p_modes) > 1048576 THEN
    RAISE EXCEPTION 'p_modes exceeds the maximum payload size';
  END IF;

  -- Validate every mode before spending rate-limit budget: a later RAISE would
  -- roll the whole transaction back, refunding the consumed slot and leaving
  -- malformed requests effectively unthrottled.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
      RAISE EXCEPTION 'Unsupported game mode: %', v_mode;
    END IF;
    IF jsonb_typeof(v_progress) <> 'object' THEN
      RAISE EXCEPTION 'Progress for % must be a JSON object', v_mode;
    END IF;
  END LOOP;

  SELECT allowed
  INTO v_rate_allowed
  FROM public.consume_mutation_rate_limit('progress-sync', v_user_id::TEXT, 60, 60);
  IF NOT COALESCE(v_rate_allowed, false) THEN
    RAISE EXCEPTION 'Progress sync rate limit exceeded';
  END IF;

  -- The account row carries metadata only; its legacy mode columns keep their defaults.
  INSERT INTO public.user_progress (user_id, current_game_mode, game_edition, tarkov_uid)
  VALUES (v_user_id, p_current_game_mode, COALESCE(p_game_edition, 1), NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT tarkov_uid
  INTO v_stored_uid
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- The account lock serializes RPC writers, including a first insert for a mode. Merge against
  -- the stored normalized row before comparing for unchanged writes.
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    SELECT progress_data INTO v_existing_mode
    FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = v_mode
      AND season_number = CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END
    FOR UPDATE;
    p_modes := jsonb_set(p_modes, ARRAY[v_mode],
      private.merge_task_identity_progress(
        COALESCE(v_existing_mode, v_empty_object), v_progress, v_mode));
  END LOOP;

  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode = v_seasonal_mode
      AND (p_seasonal_season_number IS NULL OR p_seasonal_season_number <> v_active_season) THEN
      -- A client sync always carries every mode in one payload. Skip stale
      -- Seasonal state instead of raising, which would roll back the valid
      -- persistent-mode progress from the same request and take cloud sync
      -- offline for every client whose bundled season number lags the database.
      CONTINUE;
    END IF;
    v_season_number := CASE
      WHEN v_mode = v_seasonal_mode THEN v_active_season
      ELSE 0
    END;
    INSERT INTO public.user_game_mode_progress (
      user_id,
      game_mode,
      season_number,
      progress_data
    )
    VALUES (
      v_user_id,
      v_mode,
      v_season_number,
      public.sanitize_user_progress_mode_data(v_progress)
    )
    ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data
    WHERE user_game_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
    GET DIAGNOSTICS v_rows_changed = ROW_COUNT;
    v_persistent_changed := v_persistent_changed
      OR (v_mode IN (v_pvp_mode, v_pve_mode) AND v_rows_changed > 0);
  END LOOP;

  -- Preserve the accepted v1 account-clock contract once per sync, without writing legacy JSON.
  -- Seasonal-only syncs still leave this clock alone; identical persistent syncs do as well.
  UPDATE public.user_progress
  SET current_game_mode = p_current_game_mode,
    game_edition = COALESCE(p_game_edition, 1), updated_at = now()
  WHERE user_id = v_user_id
    AND (v_persistent_changed OR (current_game_mode, game_edition)
      IS DISTINCT FROM (p_current_game_mode, COALESCE(p_game_edition, 1)));

  -- Link last, in its own savepoint: a UID owned by another account leaves this account's link
  -- unchanged and is reported, instead of rolling back the progress written above.
  IF p_tarkov_uid IS DISTINCT FROM v_stored_uid THEN
    BEGIN
      UPDATE public.user_progress SET tarkov_uid = p_tarkov_uid WHERE user_id = v_user_id;
      v_stored_uid := p_tarkov_uid;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'user_progress_tarkov_uid_unique' THEN
        RAISE;
      END IF;
      v_uid_conflict := true;
    END;
  END IF;

  RETURN jsonb_build_object('tarkov_uid', v_stored_uid, 'tarkov_uid_conflict', v_uid_conflict,
    'metadata_write_id', (SELECT metadata_write_id FROM public.user_progress WHERE user_id = v_user_id));
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_game_profile_progress(p_profile_id uuid, p_game_edition integer, p_modes jsonb, p_seasonal_season_number smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_pvp_mode CONSTANT TEXT := 'pvp';
  v_pve_mode CONSTANT TEXT := 'pve';
  v_seasonal_mode CONSTANT TEXT := 'seasonal';
  v_empty_object CONSTANT JSONB := '{}'::jsonb;
  v_active_season SMALLINT := private.active_season_number();
  v_default BOOLEAN;
  v_mode TEXT;
  v_progress JSONB;
  v_existing JSONB;
  v_season_number SMALLINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;
  IF pg_column_size(p_modes) > 1048576 THEN
    RAISE EXCEPTION 'p_modes exceeds the maximum payload size';
  END IF;
  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode NOT IN (v_pvp_mode, v_pve_mode, v_seasonal_mode) THEN
      RAISE EXCEPTION 'Unsupported game mode: %', v_mode;
    END IF;
    IF jsonb_typeof(v_progress) <> 'object' THEN
      RAISE EXCEPTION 'Progress for % must be a JSON object', v_mode;
    END IF;
  END LOOP;

  PERFORM private.consume_game_profile_rate_limit(v_user_id, 'game-profile-sync');

  SELECT is_default INTO v_default FROM public.user_game_profiles
  WHERE id = p_profile_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game profile not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_default THEN
    RAISE EXCEPTION 'The default game profile uses the standard progress sync'
      USING ERRCODE = 'PT409';
  END IF;
  IF NOT private.game_profiles_unlocked(v_user_id) THEN
    RAISE EXCEPTION 'Game profiles require supporter access' USING ERRCODE = 'PT403';
  END IF;

  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode = v_seasonal_mode
      AND (p_seasonal_season_number IS NULL OR p_seasonal_season_number <> v_active_season) THEN
      CONTINUE;
    END IF;
    v_season_number := CASE WHEN v_mode = v_seasonal_mode THEN v_active_season ELSE 0 END;
    SELECT progress_data INTO v_existing FROM public.user_profile_mode_progress
    WHERE profile_id = p_profile_id AND game_mode = v_mode AND season_number = v_season_number;
    INSERT INTO public.user_profile_mode_progress (
      profile_id, user_id, game_mode, season_number, progress_data
    )
    VALUES (
      p_profile_id, v_user_id, v_mode, v_season_number,
      public.sanitize_user_progress_mode_data(
        private.merge_task_identity_progress(COALESCE(v_existing, v_empty_object), v_progress, v_mode))
    )
    ON CONFLICT (profile_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data, updated_at = now()
    WHERE user_profile_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
  END LOOP;

  UPDATE public.user_game_profiles
  SET game_edition = p_game_edition, updated_at = now()
  WHERE id = p_profile_id AND p_game_edition IS NOT NULL
    AND game_edition IS DISTINCT FROM p_game_edition;

  RETURN jsonb_build_object('profile_id', p_profile_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.progress_data := private.merge_task_identity_progress(OLD.progress_data, NEW.progress_data, NEW.game_mode);
  END IF;
  NEW.progress_data := public.sanitize_user_progress_mode_data(
    COALESCE(NEW.progress_data, '{}'::jsonb)
  );
  IF TG_OP = 'INSERT' THEN
    NEW.progress_updated_at := now();
  ELSIF NEW.progress_data IS DISTINCT FROM OLD.progress_data THEN
    NEW.progress_updated_at := now();
  ELSE
    NEW.progress_updated_at := OLD.progress_updated_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
