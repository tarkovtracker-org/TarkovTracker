-- Schema only: redefines the PvP/PvE backfill helper so an approved operator can materialize
-- legacy-only progress (#1028) without the costs that made the 2026-08-06 attempts unsafe.
--
-- The previous helper proposed every user_progress row in the range. ON CONFLICT DO UPDATE locks
-- every conflicting row even when its WHERE skips the update, and the BEFORE INSERT trigger
-- sanitized every proposal before conflict detection, so each range locked and re-sanitized the
-- already-normalized rows of active users. It also looked like user activity: the prepare trigger
-- stamped updated_at/progress_updated_at with now() and retain_progress_activity cleared
-- account_retention.pending_since, rescuing dormant accounts from inactivity cleanup.
--
-- The new helper only touches rows that lack a numeric level while the legacy column has one (the
-- same test as merge_progress_data's lazy seed). Missing rows are inserted with ON CONFLICT DO
-- NOTHING, which takes no lock on existing rows; placeholder rows are repaired by an UPDATE whose
-- WHERE re-checks the level after waiting, so a concurrent real save always wins.
--
-- The helper sets tarkovtracker.mode_progress_backfill transaction-locally and restores the prior
-- value before returning; an error reverts it with the aborted (sub)transaction. While set, the
-- prepare trigger keeps the source timestamps and records unknown freshness, and
-- track_account_mutation records no activity. Only the owner can run the helper;
-- other sessions never observe the setting.
CREATE OR REPLACE FUNCTION private.mode_progress_backfill_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(current_setting('tarkovtracker.mode_progress_backfill', true), '') = 'on';
$$;

REVOKE ALL ON FUNCTION private.mode_progress_backfill_active() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Inlined: this invoker trigger also runs for service_role, which cannot execute private helpers.
  v_backfill BOOLEAN :=
    COALESCE(current_setting('tarkovtracker.mode_progress_backfill', true), '') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.progress_data := public.merge_manual_activity_progress(OLD.progress_data, NEW.progress_data);
  END IF;
  NEW.progress_data := public.sanitize_user_progress_mode_data(
    COALESCE(NEW.progress_data, '{}'::jsonb)
  );
  IF v_backfill THEN
    NEW.progress_updated_at := NULL;
    IF TG_OP = 'UPDATE' THEN
      NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
  END IF;
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
$$;

REVOKE ALL ON FUNCTION public.prepare_user_game_mode_progress_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.track_account_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.mode_progress_backfill_active() THEN
    PERFORM public.record_account_activity(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.track_account_mutation() FROM PUBLIC, anon, authenticated;

-- Legacy payloads with a numeric level whose normalized row is missing or has none. This is both the
-- backfill source and the completion gate: every range must return zero rows for both modes before
-- the fallback reads are removed.
CREATE OR REPLACE FUNCTION private.unmaterialized_mode_progress(p_from UUID, p_to UUID)
RETURNS TABLE (
  user_id UUID,
  game_mode TEXT,
  progress_data JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  has_row BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    progress.user_id,
    mode.game_mode,
    mode.progress_data,
    progress.created_at,
    progress.updated_at,
    target.user_id IS NOT NULL
  FROM public.user_progress progress
  CROSS JOIN LATERAL (
    VALUES ('pvp'::TEXT, progress.pvp_data), ('pve'::TEXT, progress.pve_data)
  ) AS mode(game_mode, progress_data)
  LEFT JOIN public.user_game_mode_progress target
    ON target.user_id = progress.user_id
    AND target.game_mode = mode.game_mode
    AND target.season_number = 0
  WHERE progress.user_id >= p_from
    AND (p_to IS NULL OR progress.user_id < p_to)
    AND jsonb_typeof(mode.progress_data->'level') = 'number'
    AND jsonb_typeof(target.progress_data->'level') IS DISTINCT FROM 'number';
$$;

REVOKE ALL ON FUNCTION private.unmaterialized_mode_progress(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- One call handles one key range and commits with its caller. lock_timeout makes a range that meets
-- a live write fail fast and roll back; re-running it is a no-op for completed rows.
CREATE OR REPLACE FUNCTION private.backfill_game_mode_progress_range(
  p_from UUID,
  p_to UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = ''
SET lock_timeout = '2s'
AS $$
DECLARE
  v_previous TEXT := current_setting('tarkovtracker.mode_progress_backfill', true);
  v_inserted BIGINT;
  v_repaired BIGINT;
BEGIN
  PERFORM set_config('tarkovtracker.mode_progress_backfill', 'on', true);
  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    progress_data,
    profile_public,
    created_at,
    updated_at
  )
  SELECT
    legacy.user_id,
    legacy.game_mode,
    0,
    legacy.progress_data,
    CASE legacy.game_mode
      WHEN 'pvp' THEN COALESCE(preferences.profile_share_pvp_public, false)
      ELSE COALESCE(preferences.profile_share_pve_public, false)
    END,
    COALESCE(legacy.created_at, users.created_at, 'epoch'),
    -- Never later than evidence account_last_activity already counts, so no retention change.
    COALESCE(legacy.updated_at, users.created_at, 'epoch')
  FROM private.unmaterialized_mode_progress(p_from, p_to) legacy
  LEFT JOIN auth.users users ON users.id = legacy.user_id
  LEFT JOIN public.user_preferences preferences ON preferences.user_id = legacy.user_id
  WHERE NOT legacy.has_row
  ON CONFLICT (user_id, game_mode, season_number) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.user_game_mode_progress target
  SET progress_data = legacy.progress_data
  FROM private.unmaterialized_mode_progress(p_from, p_to) legacy
  WHERE legacy.has_row
    AND target.user_id = legacy.user_id
    AND target.game_mode = legacy.game_mode
    AND target.season_number = 0
    AND jsonb_typeof(target.progress_data->'level') IS DISTINCT FROM 'number';
  GET DIAGNOSTICS v_repaired = ROW_COUNT;

  PERFORM set_config('tarkovtracker.mode_progress_backfill', COALESCE(v_previous, ''), true);
  RETURN v_inserted + v_repaired;
END;
$$;

REVOKE ALL ON FUNCTION private.backfill_game_mode_progress_range(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
