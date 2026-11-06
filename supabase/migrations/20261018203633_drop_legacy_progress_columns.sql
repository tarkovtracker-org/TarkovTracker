-- Retire legacy readers after the approved #1072 normalized-reader cutoff.
-- Retain all account rows, metadata and cached-client account-clock updates.
-- No data rewrite, CASCADE, privilege changes or physical reclamation.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.progress_data := public.merge_manual_activity_progress(OLD.progress_data, NEW.progress_data);
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
$$;

CREATE OR REPLACE FUNCTION private.track_account_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.record_account_activity(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP FUNCTION private.backfill_game_mode_progress_range(UUID, UUID);
DROP FUNCTION private.unmaterialized_mode_progress(UUID, UUID);
DROP FUNCTION private.mode_progress_backfill_active();

DROP VIEW public.team_member_summary;
DROP FUNCTION public.get_teammate_legacy_progress(UUID, TEXT);

DROP TRIGGER a_append_api_update_history ON public.user_progress;
DROP TRIGGER sanitize_user_progress_payload ON public.user_progress;
DROP FUNCTION public.populate_user_progress_api_update_history();
DROP FUNCTION public.sanitize_user_progress_row();

ALTER TABLE public.user_progress
  DROP COLUMN pvp_data RESTRICT,
  DROP COLUMN pve_data RESTRICT;

NOTIFY pgrst, 'reload schema';

COMMIT;
