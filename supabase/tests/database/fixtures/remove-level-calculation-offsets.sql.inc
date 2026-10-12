-- Manual maintenance only, after the schema migration and refreshed clients.
-- Run with psql --single-transaction --set ON_ERROR_STOP=1 and UUID bounds.
-- DDL holds table locks for this bounded transaction; use a quiet window.
CREATE TEMP TABLE level_cleanup_bounds ON COMMIT DROP AS
SELECT :'from_user_id'::uuid AS lower_bound, :'to_user_id'::uuid AS upper_bound;

DO $$
BEGIN
  IF to_regclass('pg_temp.level_cleanup_bounds') IS NULL THEN
    RAISE EXCEPTION 'Run this file in one transaction (--single-transaction)';
  END IF;
  IF EXISTS (SELECT 1 FROM level_cleanup_bounds WHERE lower_bound IS NULL OR upper_bound IS NULL OR lower_bound >= upper_bound) THEN
    RAISE EXCEPTION 'Require increasing, exclusive upper UUID bound';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences'
      AND column_name = 'use_automatic_level_calculation') THEN
    RAISE EXCEPTION 'Apply the automatic-level removal migration first';
  END IF;
END;
$$;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
-- Freeze the affected tables briefly so the limit and updates see the same users.
LOCK TABLE public.user_progress, public.user_game_mode_progress,
  public.user_profile_mode_progress, public.user_prestige_runs IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  lower_id uuid;
  upper_id uuid;
BEGIN
  SELECT lower_bound, upper_bound INTO lower_id, upper_id FROM level_cleanup_bounds;
  IF (SELECT count(*) FROM (
    SELECT user_id FROM public.user_progress
      WHERE user_id >= lower_id AND user_id < upper_id
        AND (pvp_data ? 'xpOffset' OR pve_data ? 'xpOffset')
    UNION
    SELECT user_id FROM public.user_game_mode_progress
      WHERE user_id >= lower_id AND user_id < upper_id AND progress_data ? 'xpOffset'
    UNION
    SELECT user_id FROM public.user_profile_mode_progress
      WHERE user_id >= lower_id AND user_id < upper_id AND progress_data ? 'xpOffset'
    UNION
    SELECT user_id FROM public.user_prestige_runs
      WHERE user_id >= lower_id AND user_id < upper_id AND archived_progress ? 'xpOffset'
  ) affected) > 100 THEN
    RAISE EXCEPTION 'Range exceeds 100 affected users; narrow UUID bounds';
  END IF;
END;
$$;

-- Existing activity triggers honor this owner-only maintenance convention.
SET LOCAL tarkovtracker.mode_progress_backfill = 'on';
-- Run last among BEFORE triggers: strip exactly the retired field, preserving every
-- other JSON value, freshness clocks, and write marker after the usual triggers run.
CREATE FUNCTION pg_temp.preserve_level_cleanup_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := OLD.updated_at;
  IF TG_TABLE_NAME = 'user_progress' THEN
    NEW.metadata_write_id := OLD.metadata_write_id;
    NEW.pvp_data := OLD.pvp_data - 'xpOffset';
    NEW.pve_data := OLD.pve_data - 'xpOffset';
  ELSE
    NEW.progress_data := OLD.progress_data - 'xpOffset';
    IF TG_TABLE_NAME = 'user_game_mode_progress' THEN
      NEW.progress_updated_at := OLD.progress_updated_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zzzz_level_cleanup BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.preserve_level_cleanup_state();
CREATE TRIGGER zzzz_level_cleanup BEFORE UPDATE ON public.user_game_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.preserve_level_cleanup_state();
CREATE TRIGGER zzzz_level_cleanup BEFORE UPDATE ON public.user_profile_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.preserve_level_cleanup_state();

UPDATE public.user_progress row SET
  pvp_data = row.pvp_data - 'xpOffset', pve_data = row.pve_data - 'xpOffset'
WHERE row.user_id >= (SELECT lower_bound FROM level_cleanup_bounds)
  AND row.user_id < (SELECT upper_bound FROM level_cleanup_bounds)
  AND (row.pvp_data ? 'xpOffset' OR row.pve_data ? 'xpOffset');
UPDATE public.user_game_mode_progress row SET progress_data = row.progress_data - 'xpOffset'
WHERE row.user_id >= (SELECT lower_bound FROM level_cleanup_bounds)
  AND row.user_id < (SELECT upper_bound FROM level_cleanup_bounds)
  AND row.progress_data ? 'xpOffset';
UPDATE public.user_profile_mode_progress row SET progress_data = row.progress_data - 'xpOffset'
WHERE row.user_id >= (SELECT lower_bound FROM level_cleanup_bounds)
  AND row.user_id < (SELECT upper_bound FROM level_cleanup_bounds)
  AND row.progress_data ? 'xpOffset';
UPDATE public.user_prestige_runs row SET archived_progress = row.archived_progress - 'xpOffset'
WHERE row.user_id >= (SELECT lower_bound FROM level_cleanup_bounds)
  AND row.user_id < (SELECT upper_bound FROM level_cleanup_bounds)
  AND row.archived_progress ? 'xpOffset';

DROP TRIGGER zzzz_level_cleanup ON public.user_progress;
DROP TRIGGER zzzz_level_cleanup ON public.user_game_mode_progress;
DROP TRIGGER zzzz_level_cleanup ON public.user_profile_mode_progress;
DROP FUNCTION pg_temp.preserve_level_cleanup_state();
-- Do not let subsequent statements in this transaction inherit maintenance mode.
SET LOCAL tarkovtracker.mode_progress_backfill = 'off';
DROP TABLE level_cleanup_bounds;
