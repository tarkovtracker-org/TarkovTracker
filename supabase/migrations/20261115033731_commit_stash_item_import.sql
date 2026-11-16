-- Browser-reviewed, absolute reconciliation for the default game profile only. The browser's
-- existing catalog/distribution policy owns eligibility and needed counts; this RPC is not a
-- catalog authority and cannot infer parent quest/module completion from an objective ID.
-- Full canonical snapshot CAS prevents a concurrent reset, completion or count edit from
-- applying a review calculated against another baseline. No screenshot or OCR text is stored.
CREATE TABLE private.stash_item_import_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_mode text NOT NULL CHECK (game_mode IN ('pvp', 'pve', 'seasonal')),
  season_number integer NOT NULL,
  import_id uuid NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  request_hash text NOT NULL,
  progress_epoch integer NOT NULL,
  protected_entries jsonb NOT NULL CHECK (jsonb_typeof(protected_entries) = 'array'
    AND jsonb_array_length(protected_entries) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, game_mode, season_number, import_id),
  UNIQUE (user_id, game_mode, season_number, source_hash)
);
CREATE INDEX stash_item_import_receipts_retention_idx
  ON private.stash_item_import_receipts (user_id, created_at DESC);
CREATE INDEX stash_item_import_receipts_protection_idx
  ON private.stash_item_import_receipts USING gin (protected_entries jsonb_path_ops);
ALTER TABLE private.stash_item_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.stash_item_import_receipts FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE private.stash_item_import_receipts IS
  'Owner-scoped image/request hashes and touched objective IDs, before-record hashes and imported clocks; no image/OCR content or raw snapshots. No client reads. Bounded to 100 recent imports per account; 90-day expiry is pruned on committed import calls. Absolute counts remain non-additive after expiry.';

CREATE FUNCTION private.hash_stash_item_import_record(p_record jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(COALESCE(p_record::text, '__missing__'), 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION private.hash_stash_item_import_record(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- Narrow protection against a delayed normal sync carrying the exact pre-import entry (or
-- the exact prior absence). This is deliberately not a generic last-write-wins policy.
-- Deliberately restoring that exact old record without a new timestamp is indistinguishable
-- from stale sync and is blocked while a receipt is retained. Timestamped edits and full
-- progress-epoch resets remain authoritative. Other stale writes retain existing semantics.
CREATE FUNCTION private.guard_stash_item_import_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_map text;
  v_id text;
  v_current jsonb;
BEGIN
  IF ROW(NEW.progress_data->'taskObjectives', NEW.progress_data->'hideoutParts')
    IS NOT DISTINCT FROM ROW(OLD.progress_data->'taskObjectives', OLD.progress_data->'hideoutParts') THEN
    RETURN NEW;
  END IF;
  IF public.sanitize_manual_activity_epoch(NEW.progress_data->'progressEpoch')
    IS DISTINCT FROM public.sanitize_manual_activity_epoch(OLD.progress_data->'progressEpoch') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.stash_item_import_receipts receipt
    WHERE receipt.user_id=NEW.user_id AND receipt.game_mode=NEW.game_mode
      AND receipt.season_number=NEW.season_number
      AND receipt.progress_epoch=public.sanitize_manual_activity_epoch(NEW.progress_data->'progressEpoch')
      AND receipt.created_at>=clock_timestamp()-interval '90 days') THEN
    RETURN NEW;
  END IF;
  -- Hash each changed stored key once, then probe receipt containment before expanding any
  -- protected entries. A receipt cap is not a work budget: 100 * 256 entries must never
  -- cause repeated hashing of an unchanged or nonmatching target. EXISTS stops after a
  -- qualifying protection; older matching before-images remain valid after later imports.
  FOR v_map, v_id, v_current IN
    WITH changed AS MATERIALIZED (
      SELECT field.map, entry.key AS id, entry.value AS current_record,
        (entry.value->>'timestamp')::numeric AS current_timestamp,
        private.hash_stash_item_import_record(NEW.progress_data#>ARRAY[field.map,entry.key]) AS before_hash
      FROM (VALUES ('taskObjectives'),('hideoutParts')) field(map)
      CROSS JOIN LATERAL jsonb_each(OLD.progress_data->field.map) entry
      WHERE entry.value IS DISTINCT FROM NEW.progress_data#>ARRAY[field.map,entry.key]
        AND jsonb_typeof(entry.value->'timestamp')='number'
    )
    SELECT changed.map,changed.id,changed.current_record FROM changed
    WHERE EXISTS (
      SELECT 1 FROM private.stash_item_import_receipts receipt
      WHERE receipt.user_id=NEW.user_id AND receipt.game_mode=NEW.game_mode
        AND receipt.season_number=NEW.season_number
        AND receipt.progress_epoch=public.sanitize_manual_activity_epoch(NEW.progress_data->'progressEpoch')
        AND receipt.created_at>=clock_timestamp()-interval '90 days'
        AND receipt.protected_entries @> jsonb_build_array(jsonb_build_object(
          'map',changed.map,'id',changed.id,'before_hash',changed.before_hash))
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.protected_entries) protection
          WHERE protection->>'map'=changed.map AND protection->>'id'=changed.id
            AND protection->>'before_hash'=changed.before_hash
            AND (protection->>'imported_timestamp')::numeric<=changed.current_timestamp)
    ) LOOP
    IF jsonb_typeof(NEW.progress_data->v_map) IS DISTINCT FROM 'object' THEN
      NEW.progress_data := jsonb_set(NEW.progress_data, ARRAY[v_map], '{}'::jsonb);
    END IF;
    NEW.progress_data := jsonb_set(NEW.progress_data, ARRAY[v_map,v_id], v_current);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_stash_item_import_sync() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_stash_item_import_sync BEFORE UPDATE OF progress_data
  ON public.user_game_mode_progress FOR EACH ROW EXECUTE FUNCTION private.guard_stash_item_import_sync();

CREATE FUNCTION private.commit_stash_item_import(
  p_mode text, p_season integer, p_import_id uuid, p_source_hash text,
  p_expected jsonb, p_updates jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_current jsonb;
  v_result jsonb;
  v_update jsonb;
  v_record jsonb;
  v_map text;
  v_id text;
  v_count integer;
  v_needed integer;
  v_clock numeric;
  v_epoch integer;
  v_missing boolean;
  v_protected jsonb := '[]'::jsonb;
  v_request_hash text;
  v_receipt private.stash_item_import_receipts%ROWTYPE;
  v_rate_allowed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('pvp', 'pve', 'seasonal')
    OR p_season IS NULL OR p_season <> (CASE WHEN p_mode = 'seasonal'
      THEN private.active_season_number() ELSE 0 END) THEN
    RAISE EXCEPTION 'Invalid import mode or season' USING ERRCODE = '22023';
  END IF;
  IF p_import_id IS NULL OR p_source_hash IS NULL
    OR p_source_hash !~ '^[0-9a-f]{64}$'
    OR (p_expected IS NOT NULL AND jsonb_typeof(p_expected) IS DISTINCT FROM 'object')
    OR pg_column_size(p_expected) > 1048576 THEN
    RAISE EXCEPTION 'Invalid import identity or expected progress' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid import updates' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_updates) NOT BETWEEN 1 AND 256
    OR pg_column_size(p_updates) > 262144 THEN
    RAISE EXCEPTION 'Invalid import batch size' USING ERRCODE = '22023';
  END IF;

  -- Validate the entire batch before acquiring locks or making any writes. Separate type
  -- checks from numeric casts so malformed inputs always fail as invalid arguments.
  FOR v_update IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    IF jsonb_typeof(v_update) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid import update' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_update ?& ARRAY['id', 'type', 'count', 'needed'])
      OR (v_update - ARRAY['id', 'type', 'count', 'needed']) <> '{}'::jsonb
      OR jsonb_typeof(v_update->'id') IS DISTINCT FROM 'string'
      OR nullif(btrim(v_update->>'id'), '') IS NULL
      OR octet_length(v_update->>'id') > 256
      OR (v_update->>'id') ~ '[[:cntrl:]]'
      OR jsonb_typeof(v_update->'type') IS DISTINCT FROM 'string'
      OR v_update->>'type' NOT IN ('task', 'hideout')
      OR jsonb_typeof(v_update->'count') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_update->'needed') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid import update fields' USING ERRCODE = '22023';
    END IF;
    IF (v_update->>'count')::numeric NOT BETWEEN 0 AND 1000000
      OR (v_update->>'needed')::numeric NOT BETWEEN 1 AND 1000000
      OR trunc((v_update->>'count')::numeric) <> (v_update->>'count')::numeric
      OR trunc((v_update->>'needed')::numeric) <> (v_update->>'needed')::numeric
      OR (v_update->>'count')::numeric > (v_update->>'needed')::numeric THEN
      RAISE EXCEPTION 'Invalid import counts' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_updates) entry
    GROUP BY entry->>'type', entry->>'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate import objective' USING ERRCODE = '22023';
  END IF;
  -- Validate the bounded batch first: a later validation exception would refund an admitted
  -- slot. Every valid attempt (including CAS conflicts/replays/duplicates) spends one owner
  -- slot before hashing the full snapshot or acquiring feature/account/progress locks.
  SELECT allowed INTO v_rate_allowed FROM public.consume_mutation_rate_limit(
    'stash-item-import',v_user_id::text,60,60);
  IF NOT COALESCE(v_rate_allowed,false) THEN
    RAISE EXCEPTION 'Stash item import rate limit exceeded' USING ERRCODE='PT429';
  END IF;
  v_request_hash := encode(sha256(convert_to(
    jsonb_build_object('expected', p_expected, 'updates', p_updates)::text, 'UTF8')), 'hex');

  -- Match the account -> mode lock order of browser sync and public API progress writers.
  -- SQL NULL expected means absence, initialized only from the canonical empty server state.
  -- The feature-specific owner lock also lets timeout recovery wait for a first-row INSERT.
  PERFORM pg_advisory_xact_lock(hashtextextended('stash-import:' || v_user_id::text, 0));
  INSERT INTO public.user_progress(user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.user_progress WHERE user_id = v_user_id FOR UPDATE;
  DELETE FROM private.stash_item_import_receipts WHERE user_id = v_user_id
    AND created_at < clock_timestamp() - interval '90 days';
  SELECT progress_data INTO v_current FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season FOR UPDATE;
  v_missing := NOT FOUND;
  IF v_missing THEN v_current := public.sanitize_user_progress_mode_data('{}'::jsonb); END IF;
  v_epoch := public.sanitize_manual_activity_epoch(v_current->'progressEpoch');
  SELECT * INTO v_receipt FROM private.stash_item_import_receipts
    WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season
      AND import_id = p_import_id;
  IF FOUND THEN
    IF v_receipt.progress_epoch <> v_epoch THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'progress_reset',
        'receipt_id', v_receipt.import_id, 'progress_data', v_current);
    END IF;
    IF v_receipt.source_hash <> p_source_hash OR v_receipt.request_hash <> v_request_hash THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'import_id_reused',
        'receipt_id', v_receipt.import_id, 'progress_data', v_current);
    END IF;
    -- Return the live row, never the old imported snapshot, even after later manual changes.
    RETURN jsonb_build_object('status', 'replayed', 'receipt_id', v_receipt.import_id,
      'progress_data', v_current);
  END IF;
  SELECT * INTO v_receipt FROM private.stash_item_import_receipts
    WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season
      AND source_hash = p_source_hash;
  IF FOUND THEN
    RETURN jsonb_build_object('status', CASE WHEN v_receipt.progress_epoch = v_epoch
      THEN 'duplicate' ELSE 'conflict' END, 'reason', CASE WHEN v_receipt.progress_epoch = v_epoch
      THEN 'source_already_imported' ELSE 'progress_reset' END,
      'receipt_id', v_receipt.import_id, 'progress_data', v_current);
  END IF;
  IF (v_missing AND p_expected IS NOT NULL)
    OR (NOT v_missing AND v_current IS DISTINCT FROM p_expected) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'baseline_changed',
      'receipt_id', NULL, 'progress_data', CASE WHEN v_missing THEN NULL ELSE v_current END);
  END IF;

  v_result := v_current;
  FOR v_update IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    v_map := CASE WHEN v_update->>'type' = 'task' THEN 'taskObjectives' ELSE 'hideoutParts' END;
    v_id := v_update->>'id';
    v_count := (v_update->>'count')::numeric::integer;
    v_needed := (v_update->>'needed')::numeric::integer;
    v_record := v_current#>ARRAY[v_map, v_id];
    IF v_map = 'taskObjectives' AND v_record->'complete' = 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'completed_objective',
        'receipt_id', NULL, 'progress_data', v_current);
    END IF;
    IF jsonb_typeof(v_record) IS DISTINCT FROM 'object' THEN v_record := '{}'::jsonb; END IF;
    v_clock := floor(extract(epoch FROM clock_timestamp()) * 1000);
    IF jsonb_typeof(v_record->'timestamp') = 'number' THEN
      v_clock := greatest(v_clock, floor((v_record->>'timestamp')::numeric) + 1);
    END IF;
    v_protected := v_protected || jsonb_build_array(jsonb_build_object('map', v_map, 'id', v_id,
      'before_hash', private.hash_stash_item_import_record(v_current#>ARRAY[v_map,v_id]),
      'imported_timestamp', v_clock));
    -- Preserve FIR/other objective flags. Task collection never hands in an objective;
    -- hideout part completion reflects the absolute collected count, including decreases.
    v_record := v_record || jsonb_build_object('count', v_count, 'timestamp', v_clock,
      'complete', CASE WHEN v_map = 'hideoutParts' THEN v_count >= v_needed ELSE false END);
    IF jsonb_typeof(v_result->v_map) IS DISTINCT FROM 'object' THEN
      v_result := jsonb_set(v_result, ARRAY[v_map], '{}'::jsonb);
    END IF;
    v_result := jsonb_set(v_result, ARRAY[v_map, v_id], v_record, true);
  END LOOP;
  IF v_missing THEN
    INSERT INTO public.user_game_mode_progress(user_id, game_mode, season_number, progress_data)
      VALUES (v_user_id, p_mode, p_season, v_result) RETURNING progress_data INTO v_result;
  ELSE
    UPDATE public.user_game_mode_progress SET progress_data = v_result
      WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season
      RETURNING progress_data INTO v_result;
  END IF;
  IF p_mode IN ('pvp', 'pve') THEN
    UPDATE public.user_progress SET updated_at = now() WHERE user_id = v_user_id;
  END IF;
  INSERT INTO private.stash_item_import_receipts
    (user_id, game_mode, season_number, import_id, source_hash, request_hash, progress_epoch, protected_entries)
    VALUES (v_user_id, p_mode, p_season, p_import_id, p_source_hash, v_request_hash, v_epoch, v_protected);
  -- The account lock serializes retention across every mode. No global scan or image data.
  DELETE FROM private.stash_item_import_receipts WHERE user_id = v_user_id
    AND (created_at < clock_timestamp() - interval '90 days' OR (game_mode, season_number, import_id)
      IN (SELECT game_mode, season_number, import_id FROM private.stash_item_import_receipts
        WHERE user_id = v_user_id ORDER BY created_at DESC, import_id DESC OFFSET 100));
  RETURN jsonb_build_object('status', 'applied', 'receipt_id', p_import_id, 'progress_data', v_result);
END;
$$;
REVOKE ALL ON FUNCTION private.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb)
  TO authenticated, service_role;

CREATE FUNCTION public.commit_stash_item_import(
  p_mode text, p_season integer, p_import_id uuid, p_source_hash text,
  p_expected jsonb, p_updates jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.commit_stash_item_import(p_mode, p_season, p_import_id, p_source_hash,
    p_expected, p_updates);
$$;
REVOKE ALL ON FUNCTION public.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb)
  TO authenticated, service_role;

-- Timeout recovery reads only receipt existence and live progress, never stored hashes or
-- target metadata. A missing receipt is not permission to retry a changed local baseline.
CREATE FUNCTION private.get_stash_item_import(p_mode text, p_season integer, p_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_current jsonb;
  v_receipt_id uuid;
  v_rate_allowed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('pvp', 'pve', 'seasonal') OR p_import_id IS NULL
    OR p_season IS NULL OR p_season <> (CASE WHEN p_mode = 'seasonal'
      THEN private.active_season_number() ELSE 0 END) THEN
    RAISE EXCEPTION 'Invalid import lookup' USING ERRCODE = '22023';
  END IF;
  -- Recovery shares admission with commit; neither mode changes nor receipt polling may
  -- bypass the per-account budget. This writes only admission metadata, never progress.
  SELECT allowed INTO v_rate_allowed FROM public.consume_mutation_rate_limit(
    'stash-item-import',v_user_id::text,60,60);
  IF NOT COALESCE(v_rate_allowed,false) THEN
    RAISE EXCEPTION 'Stash item import rate limit exceeded' USING ERRCODE='PT429';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stash-import:' || v_user_id::text, 0));
  PERFORM 1 FROM public.user_progress WHERE user_id = v_user_id FOR UPDATE;
  SELECT progress_data INTO v_current FROM public.user_game_mode_progress
    WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season FOR UPDATE;
  SELECT import_id INTO v_receipt_id FROM private.stash_item_import_receipts
    WHERE user_id = v_user_id AND game_mode = p_mode AND season_number = p_season
      AND import_id = p_import_id AND created_at >= clock_timestamp() - interval '90 days';
  RETURN jsonb_build_object('status', CASE WHEN v_receipt_id IS NULL THEN 'missing' ELSE 'found' END,
    'receipt_id', v_receipt_id, 'progress_data', v_current);
END;
$$;
REVOKE ALL ON FUNCTION private.get_stash_item_import(text, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_stash_item_import(text, integer, uuid) TO authenticated, service_role;
CREATE FUNCTION public.get_stash_item_import(p_mode text, p_season integer, p_import_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.get_stash_item_import(p_mode, p_season, p_import_id);
$$;
REVOKE ALL ON FUNCTION public.get_stash_item_import(text, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stash_item_import(text, integer, uuid) TO authenticated, service_role;
