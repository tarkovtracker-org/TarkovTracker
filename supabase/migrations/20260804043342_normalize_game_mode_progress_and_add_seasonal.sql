CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 1::SMALLINT;
$$;

REVOKE ALL ON FUNCTION private.active_season_number() FROM PUBLIC;

ALTER TABLE public.user_progress
  DROP CONSTRAINT IF EXISTS user_progress_current_game_mode_check;
ALTER TABLE public.user_progress
  ADD CONSTRAINT user_progress_current_game_mode_check
  CHECK (current_game_mode IN ('pvp', 'pve', 'seasonal'));

CREATE TABLE public.user_game_mode_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_mode TEXT NOT NULL,
  season_number SMALLINT NOT NULL DEFAULT 0,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_mode, season_number),
  CONSTRAINT user_game_mode_progress_game_mode_check
    CHECK (game_mode IN ('pvp', 'pve', 'seasonal')),
  CONSTRAINT user_game_mode_progress_season_check
    CHECK (
      (game_mode IN ('pvp', 'pve') AND season_number = 0)
      OR (game_mode = 'seasonal' AND season_number > 0)
    )
);

ALTER TABLE public.user_game_mode_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_game_mode_progress FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_game_mode_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_game_mode_progress;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_user_game_mode(
  p_user_id UUID,
  p_game_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT auth.uid()) = p_user_id
    OR EXISTS (
      SELECT 1
      FROM public.team_memberships viewer
      JOIN public.team_memberships teammate
        ON teammate.team_id = viewer.team_id
       AND teammate.game_mode = viewer.game_mode
      WHERE viewer.user_id = (SELECT auth.uid())
        AND viewer.game_mode = p_game_mode
        AND teammate.user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_user_game_mode(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_user_game_mode(UUID, TEXT) TO authenticated;

CREATE POLICY "Users can view own and teammate mode progress"
  ON public.user_game_mode_progress
  FOR SELECT
  TO authenticated
  USING ((SELECT private.can_access_user_game_mode(user_id, game_mode)));

CREATE POLICY "Users can insert own mode progress"
  ON public.user_game_mode_progress
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own mode progress"
  ON public.user_game_mode_progress
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own mode progress"
  ON public.user_game_mode_progress
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_game_mode_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_game_mode_progress TO service_role;

CREATE OR REPLACE FUNCTION public.set_game_mode_profile_visibility(
  p_game_mode TEXT,
  p_season_number SMALLINT,
  p_profile_public BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF (p_game_mode IN ('pvp', 'pve') AND p_season_number <> 0)
    OR (p_game_mode = 'seasonal' AND p_season_number <= 0) THEN
    RAISE EXCEPTION 'Invalid season number for mode';
  END IF;

  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    profile_public
  )
  VALUES (v_user_id, p_game_mode, p_season_number, p_profile_public)
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET profile_public = EXCLUDED.profile_public;
END;
$$;

REVOKE ALL ON FUNCTION public.set_game_mode_profile_visibility(TEXT, SMALLINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_game_mode_profile_visibility(TEXT, SMALLINT, BOOLEAN)
  TO authenticated;

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
  progress.user_id,
  mode.game_mode,
  0,
  public.sanitize_user_progress_mode_data(mode.progress_data),
  CASE mode.game_mode
    WHEN 'pvp' THEN COALESCE(preferences.profile_share_pvp_public, false)
    ELSE COALESCE(preferences.profile_share_pve_public, false)
  END,
  COALESCE(progress.created_at, now()),
  COALESCE(progress.updated_at, now())
FROM public.user_progress progress
CROSS JOIN LATERAL (
  VALUES
    ('pvp'::TEXT, COALESCE(progress.pvp_data, '{}'::jsonb)),
    ('pve'::TEXT, COALESCE(progress.pve_data, '{}'::jsonb))
) AS mode(game_mode, progress_data)
LEFT JOIN public.user_preferences preferences ON preferences.user_id = progress.user_id
ON CONFLICT (user_id, game_mode, season_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prepare_user_game_mode_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.progress_data := public.sanitize_user_progress_mode_data(
    COALESCE(NEW.progress_data, '{}'::jsonb)
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_user_game_mode_progress
BEFORE INSERT OR UPDATE OF progress_data, profile_public
ON public.user_game_mode_progress
FOR EACH ROW
EXECUTE FUNCTION public.prepare_user_game_mode_progress_row();

REVOKE ALL ON FUNCTION public.prepare_user_game_mode_progress_row() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_legacy_user_progress_modes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    progress_data
  )
  VALUES
    (NEW.user_id, 'pvp', 0, COALESCE(NEW.pvp_data, '{}'::jsonb)),
    (NEW.user_id, 'pve', 0, COALESCE(NEW.pve_data, '{}'::jsonb))
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET progress_data = EXCLUDED.progress_data
  WHERE user_game_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_legacy_user_progress_modes
AFTER INSERT OR UPDATE OF pvp_data, pve_data
ON public.user_progress
FOR EACH ROW
EXECUTE FUNCTION public.sync_legacy_user_progress_modes();

REVOKE ALL ON FUNCTION public.sync_legacy_user_progress_modes() FROM PUBLIC;

DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
CREATE POLICY "Users can update own progress"
  ON public.user_progress
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own and teammates progress" ON public.user_progress;
CREATE POLICY "Users can view own progress"
  ON public.user_progress
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO service_role;

CREATE OR REPLACE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_modes JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_mode TEXT;
  v_progress JSONB;
  v_season_number SMALLINT;
  v_existing_pvp JSONB := '{}'::jsonb;
  v_existing_pve JSONB := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;

  SELECT
    COALESCE(pvp_data, '{}'::jsonb),
    COALESCE(pve_data, '{}'::jsonb)
  INTO v_existing_pvp, v_existing_pve
  FROM public.user_progress
  WHERE user_id = v_user_id;

  INSERT INTO public.user_progress (
    user_id,
    current_game_mode,
    game_edition,
    tarkov_uid,
    pvp_data,
    pve_data
  )
  VALUES (
    v_user_id,
    p_current_game_mode,
    COALESCE(p_game_edition, 1),
    p_tarkov_uid,
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->'pvp', v_existing_pvp)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->'pve', v_existing_pve))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_game_mode = EXCLUDED.current_game_mode,
    game_edition = EXCLUDED.game_edition,
    tarkov_uid = EXCLUDED.tarkov_uid,
    pvp_data = EXCLUDED.pvp_data,
    pve_data = EXCLUDED.pve_data;

  FOR v_mode, v_progress IN SELECT key, value FROM jsonb_each(p_modes) LOOP
    IF v_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
      RAISE EXCEPTION 'Unsupported game mode: %', v_mode;
    END IF;
    IF jsonb_typeof(v_progress) <> 'object' THEN
      RAISE EXCEPTION 'Progress for % must be a JSON object', v_mode;
    END IF;
    v_season_number := CASE
      WHEN v_mode = 'seasonal' THEN private.active_season_number()
      ELSE 0
    END;
    INSERT INTO public.user_game_mode_progress (
      user_id,
      game_mode,
      season_number,
      progress_data
    )
    VALUES (v_user_id, v_mode, v_season_number, v_progress)
    ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB)
  TO authenticated;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_game_mode_check;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'));
ALTER TABLE public.team_memberships DROP CONSTRAINT IF EXISTS team_memberships_game_mode_check;
ALTER TABLE public.team_memberships
  ADD CONSTRAINT team_memberships_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'));

CREATE OR REPLACE FUNCTION public.sync_user_system_team_memberships()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.game_mode = 'seasonal' THEN
      RETURN NEW;
    END IF;
    IF NEW.game_mode = 'pve' THEN
      UPDATE public.user_system
      SET pve_team_id = NEW.team_id, updated_at = now()
      WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.user_system
      SET pvp_team_id = NEW.team_id, updated_at = now()
      WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.game_mode = 'seasonal' THEN
      RETURN OLD;
    END IF;
    IF OLD.game_mode = 'pve' THEN
      UPDATE public.user_system
      SET pve_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND pve_team_id = OLD.team_id;
    ELSE
      UPDATE public.user_system
      SET pvp_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND pvp_team_id = OLD.team_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.team_id IS DISTINCT FROM NEW.team_id OR OLD.game_mode IS DISTINCT FROM NEW.game_mode THEN
    IF OLD.game_mode = 'pve' THEN
      UPDATE public.user_system
      SET pve_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND pve_team_id = OLD.team_id;
    ELSIF OLD.game_mode = 'pvp' THEN
      UPDATE public.user_system
      SET pvp_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND pvp_team_id = OLD.team_id;
    END IF;
  END IF;

  IF NEW.game_mode = 'seasonal' THEN
    RETURN NEW;
  END IF;
  IF NEW.game_mode = 'pve' THEN
    UPDATE public.user_system
    SET pve_team_id = NEW.team_id, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSE
    UPDATE public.user_system
    SET pvp_team_id = NEW.team_id, updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_system_team_memberships() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.can_access_team(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships
    WHERE team_id = p_team_id
      AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_team(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_team(UUID) TO authenticated;

DROP POLICY IF EXISTS "Users can view own and teammate memberships" ON public.team_memberships;
CREATE POLICY "Users can view own and teammate memberships"
  ON public.team_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT private.can_access_team(team_id))
  );

DROP POLICY IF EXISTS "Users can view teams they are members of" ON public.teams;
CREATE POLICY "Users can view teams they are members of"
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT private.can_access_team(id)));

GRANT SELECT ON public.teams, public.team_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams, public.team_memberships TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_memberships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_memberships;
  END IF;
END;
$$;

ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_game_mode_check;
ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'));
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_token_value_game_mode_match;
ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_token_value_game_mode_match
  CHECK (
    token_value IS NULL
    OR left(token_value, 3) = 'tt_'
    OR token_value LIKE upper(game_mode) || '\_%' ESCAPE '\'
  )
  NOT VALID;

ALTER TABLE public.user_prestige_runs
  ADD COLUMN season_number SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.user_prestige_runs
  DROP CONSTRAINT IF EXISTS user_prestige_runs_mode_check;
ALTER TABLE public.user_prestige_runs
  ADD CONSTRAINT user_prestige_runs_mode_check CHECK (mode IN ('pvp', 'pve', 'seasonal'));
ALTER TABLE public.user_prestige_runs
  ADD CONSTRAINT user_prestige_runs_season_check
  CHECK (
    (mode IN ('pvp', 'pve') AND season_number = 0)
    OR (mode = 'seasonal' AND season_number > 0)
  );
DROP INDEX IF EXISTS public.idx_user_prestige_runs_user_mode_created;
CREATE INDEX idx_user_prestige_runs_user_mode_season_created
  ON public.user_prestige_runs(user_id, mode, season_number, created_at DESC);

GRANT SELECT, DELETE ON public.user_prestige_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_prestige_runs TO service_role;

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
SET search_path = ''
AS $$
DECLARE
  v_data JSONB;
  v_game_mode TEXT;
  v_season_number SMALLINT;
  v_key TEXT;
  v_value JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  v_game_mode := CASE p_field
    WHEN 'pvp_data' THEN 'pvp'
    WHEN 'pve_data' THEN 'pve'
    WHEN 'seasonal_data' THEN 'seasonal'
    ELSE NULL
  END;
  IF v_game_mode IS NULL THEN
    RAISE EXCEPTION 'p_field must be pvp_data, pve_data, or seasonal_data';
  END IF;
  v_season_number := CASE
    WHEN v_game_mode = 'seasonal' THEN private.active_season_number()
    ELSE 0
  END;
  IF p_task_completions IS NOT NULL AND jsonb_typeof(p_task_completions) <> 'object' THEN
    RAISE EXCEPTION 'p_task_completions must be a JSON object';
  END IF;
  IF p_task_objectives IS NOT NULL AND jsonb_typeof(p_task_objectives) <> 'object' THEN
    RAISE EXCEPTION 'p_task_objectives must be a JSON object';
  END IF;
  IF p_set IS NOT NULL AND jsonb_typeof(p_set) <> 'object' THEN
    RAISE EXCEPTION 'p_set must be a JSON object';
  END IF;

  SELECT progress_data
  INTO v_data
  FROM public.user_game_mode_progress
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number
  FOR UPDATE;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_progress WHERE user_id = p_user_id) THEN
      RETURN 0;
    END IF;
    SELECT CASE v_game_mode
      WHEN 'pvp' THEN pvp_data
      WHEN 'pve' THEN pve_data
      ELSE '{}'::jsonb
    END
    INTO v_data
    FROM public.user_progress
    WHERE user_id = p_user_id;
  END IF;

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

  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    progress_data
  )
  VALUES (p_user_id, v_game_mode, v_season_number, v_data)
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET progress_data = EXCLUDED.progress_data;

  IF v_game_mode = 'pvp' THEN
    UPDATE public.user_progress SET pvp_data = v_data WHERE user_id = p_user_id;
  ELSIF v_game_mode = 'pve' THEN
    UPDATE public.user_progress SET pve_data = v_data WHERE user_id = p_user_id;
  ELSE
    UPDATE public.user_progress SET updated_at = now() WHERE user_id = p_user_id;
  END IF;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_progress_data(UUID, TEXT, JSONB, JSONB, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.archive_prestige_run_and_reset_progress(
  TEXT,
  INTEGER,
  INTEGER,
  JSONB,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  INTEGER,
  BIGINT,
  JSONB,
  JSONB
);

CREATE FUNCTION public.archive_prestige_run_and_reset_progress(
  p_mode TEXT,
  p_season_number SMALLINT,
  p_prestige_from INTEGER,
  p_prestige_to INTEGER,
  p_archived_progress JSONB,
  p_summary JSONB,
  p_created_at TIMESTAMPTZ,
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_pvp_data JSONB,
  p_pve_data JSONB,
  p_seasonal_data JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_mode NOT IN ('pvp', 'seasonal') THEN
    RAISE EXCEPTION 'Prestige is only supported for PvP modes';
  END IF;
  IF (p_mode = 'pvp' AND p_season_number <> 0)
    OR (
      p_mode = 'seasonal'
      AND p_season_number <> private.active_season_number()
    ) THEN
    RAISE EXCEPTION 'Invalid season number for mode';
  END IF;

  INSERT INTO public.user_prestige_runs (
    user_id,
    mode,
    season_number,
    prestige_from,
    prestige_to,
    archived_progress,
    summary,
    created_at
  )
  VALUES (
    v_user_id,
    p_mode,
    p_season_number,
    p_prestige_from,
    p_prestige_to,
    public.sanitize_user_progress_mode_data(COALESCE(p_archived_progress, '{}'::jsonb)),
    COALESCE(p_summary, '{}'::jsonb),
    COALESCE(p_created_at, now())
  );

  PERFORM public.sync_user_game_mode_progress(
    p_current_game_mode,
    p_game_edition,
    p_tarkov_uid,
    jsonb_build_object(
      'pvp', COALESCE(p_pvp_data, '{}'::jsonb),
      'pve', COALESCE(p_pve_data, '{}'::jsonb),
      'seasonal', COALESCE(p_seasonal_data, '{}'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_prestige_run_and_reset_progress(
  TEXT,
  SMALLINT,
  INTEGER,
  INTEGER,
  JSONB,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  INTEGER,
  BIGINT,
  JSONB,
  JSONB,
  JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_prestige_run_and_reset_progress(
  TEXT,
  SMALLINT,
  INTEGER,
  INTEGER,
  JSONB,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  INTEGER,
  BIGINT,
  JSONB,
  JSONB,
  JSONB
) TO authenticated;

CREATE FUNCTION public.archive_prestige_run_and_reset_progress(
  p_mode TEXT,
  p_prestige_from INTEGER,
  p_prestige_to INTEGER,
  p_archived_progress JSONB,
  p_summary JSONB,
  p_created_at TIMESTAMPTZ,
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_pvp_data JSONB,
  p_pve_data JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_seasonal_data JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT progress_data
  INTO v_seasonal_data
  FROM public.user_game_mode_progress
  WHERE user_id = v_user_id
    AND game_mode = 'seasonal'
    AND season_number = private.active_season_number();

  PERFORM public.archive_prestige_run_and_reset_progress(
    p_mode,
    0::SMALLINT,
    p_prestige_from,
    p_prestige_to,
    p_archived_progress,
    p_summary,
    p_created_at,
    p_current_game_mode,
    p_game_edition,
    p_tarkov_uid,
    p_pvp_data,
    p_pve_data,
    COALESCE(v_seasonal_data, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_prestige_run_and_reset_progress(
  TEXT,
  INTEGER,
  INTEGER,
  JSONB,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  INTEGER,
  BIGINT,
  JSONB,
  JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_prestige_run_and_reset_progress(
  TEXT,
  INTEGER,
  INTEGER,
  JSONB,
  JSONB,
  TIMESTAMPTZ,
  TEXT,
  INTEGER,
  BIGINT,
  JSONB,
  JSONB
) TO authenticated;
