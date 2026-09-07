-- Existing rows deliberately remain unknown; visibility timestamps cannot be backfilled
-- into progress timestamps without inventing freshness or rewriting all progress rows.
ALTER TABLE public.user_game_mode_progress
  ADD COLUMN progress_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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

REVOKE ALL ON FUNCTION public.prepare_user_game_mode_progress_row() FROM PUBLIC, anon, authenticated;
