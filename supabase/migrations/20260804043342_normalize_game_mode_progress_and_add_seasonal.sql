CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 1::SMALLINT;
$$;

REVOKE ALL ON FUNCTION private.active_season_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.active_season_starts_on()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT DATE '2026-08-03';
$$;

REVOKE ALL ON FUNCTION private.active_season_starts_on() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.active_season_ends_at()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT TIMESTAMPTZ '2026-12-07 10:00:00+00';
$$;

REVOKE ALL ON FUNCTION private.active_season_ends_at() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_active_season_number()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.active_season_number();
$$;

REVOKE ALL ON FUNCTION public.get_active_season_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_season_number() TO service_role;

ALTER TABLE public.user_progress
  DROP CONSTRAINT IF EXISTS user_progress_current_game_mode_check;
ALTER TABLE public.user_progress
  ADD CONSTRAINT user_progress_current_game_mode_check
  CHECK (current_game_mode IN ('pvp', 'pve', 'seasonal'))
  NOT VALID;

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
  p_game_mode TEXT,
  p_season_number SMALLINT
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
        AND (
          (p_game_mode IN ('pvp', 'pve') AND p_season_number = 0)
          OR (p_game_mode = 'seasonal' AND p_season_number = private.active_season_number())
        )
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_user_game_mode(UUID, TEXT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_user_game_mode(UUID, TEXT, SMALLINT)
  TO authenticated;

CREATE POLICY "Users can view own and teammate mode progress"
  ON public.user_game_mode_progress
  FOR SELECT
  TO authenticated
  USING ((SELECT private.can_access_user_game_mode(user_id, game_mode, season_number)));

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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_game_mode IS NULL OR p_game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF p_season_number IS NULL
    OR (p_game_mode IN ('pvp', 'pve') AND p_season_number <> 0)
    OR (p_game_mode = 'seasonal' AND p_season_number <> private.active_season_number()) THEN
    RAISE EXCEPTION 'Invalid season number for mode';
  END IF;

  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    profile_public
  )
  VALUES (v_user_id, p_game_mode, p_season_number, COALESCE(p_profile_public, false))
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET profile_public = EXCLUDED.profile_public;

  IF p_game_mode = 'pvp' THEN
    INSERT INTO public.user_preferences (user_id, profile_share_pvp_public)
    VALUES (v_user_id, COALESCE(p_profile_public, false))
    ON CONFLICT (user_id) DO UPDATE
    SET profile_share_pvp_public = EXCLUDED.profile_share_pvp_public;
  ELSIF p_game_mode = 'pve' THEN
    INSERT INTO public.user_preferences (user_id, profile_share_pve_public)
    VALUES (v_user_id, COALESCE(p_profile_public, false))
    ON CONFLICT (user_id) DO UPDATE
    SET profile_share_pve_public = EXCLUDED.profile_share_pve_public;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_game_mode_profile_visibility(TEXT, SMALLINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_game_mode_profile_visibility(TEXT, SMALLINT, BOOLEAN)
  TO authenticated;

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

CREATE OR REPLACE FUNCTION public.sync_legacy_profile_share_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_game_mode_progress AS ugmp (
    user_id,
    game_mode,
    season_number,
    profile_public
  )
  VALUES
    (NEW.user_id, 'pvp', 0, COALESCE(NEW.profile_share_pvp_public, false)),
    (NEW.user_id, 'pve', 0, COALESCE(NEW.profile_share_pve_public, false))
  ON CONFLICT (user_id, game_mode, season_number) DO UPDATE
  SET profile_public = EXCLUDED.profile_public
  WHERE ugmp.profile_public IS DISTINCT FROM EXCLUDED.profile_public;
  RETURN NEW;
END;
$$;

-- UPDATE only: turning sharing off from a cached older client is always an update on an existing
-- preferences row, and skipping INSERT avoids materializing normalized rows for accounts that have
-- no progress row yet.
CREATE TRIGGER sync_legacy_profile_share_visibility
AFTER UPDATE OF profile_share_pvp_public, profile_share_pve_public
ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.sync_legacy_profile_share_visibility();

REVOKE ALL ON FUNCTION public.sync_legacy_profile_share_visibility() FROM PUBLIC;

DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
CREATE POLICY "Users can update own progress"
  ON public.user_progress
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO service_role;

CREATE OR REPLACE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode TEXT,
  p_game_edition INTEGER,
  p_tarkov_uid BIGINT,
  p_modes JSONB,
  p_seasonal_season_number SMALLINT DEFAULT NULL
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
  v_active_season SMALLINT := private.active_season_number();
  v_existing_pvp JSONB := '{}'::jsonb;
  v_existing_pve JSONB := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_game_mode IS NULL OR p_current_game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Unsupported game mode';
  END IF;
  IF p_modes IS NULL OR jsonb_typeof(p_modes) <> 'object' THEN
    RAISE EXCEPTION 'p_modes must be a JSON object';
  END IF;

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
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->'pvp', '{}'::jsonb)),
    public.sanitize_user_progress_mode_data(COALESCE(p_modes->'pve', '{}'::jsonb))
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    COALESCE(pvp_data, '{}'::jsonb),
    COALESCE(pve_data, '{}'::jsonb)
  INTO v_existing_pvp, v_existing_pve
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;

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
    IF v_mode = 'seasonal'
      AND (p_seasonal_season_number IS NULL OR p_seasonal_season_number <> v_active_season) THEN
      CONTINUE;
    END IF;
    v_season_number := CASE
      WHEN v_mode = 'seasonal' THEN v_active_season
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

REVOKE ALL ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_game_mode_progress(TEXT, INTEGER, BIGINT, JSONB, SMALLINT)
  TO authenticated;

CREATE OR REPLACE VIEW public.team_member_mode_summary
WITH (security_invoker = true) AS
SELECT
  user_id,
  game_mode,
  season_number,
  progress_data->>'displayName' AS display_name,
  CASE
    WHEN jsonb_typeof(progress_data->'level') = 'number'
    THEN trunc((progress_data->>'level')::numeric)::int
  END AS level,
  (
    SELECT count(*)::int
    FROM jsonb_each(COALESCE(progress_data->'taskCompletions', '{}'::jsonb)) AS tc
    WHERE tc.value->'complete' = 'true'::jsonb
  ) AS tasks_completed
FROM public.user_game_mode_progress;

REVOKE ALL ON public.team_member_mode_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_member_mode_summary TO authenticated;
GRANT SELECT ON public.team_member_mode_summary TO service_role;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_game_mode_check;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'))
  NOT VALID;
ALTER TABLE public.team_memberships DROP CONSTRAINT IF EXISTS team_memberships_game_mode_check;
ALTER TABLE public.team_memberships
  ADD CONSTRAINT team_memberships_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'))
  NOT VALID;
ALTER TABLE public.user_system
  ADD COLUMN IF NOT EXISTS seasonal_team_id UUID
;
ALTER TABLE public.user_system
  ADD CONSTRAINT user_system_seasonal_team_id_fkey
  FOREIGN KEY (seasonal_team_id) REFERENCES public.teams(id) ON DELETE SET NULL
  NOT VALID;

CREATE OR REPLACE FUNCTION public.create_team_with_owner(
  p_name TEXT,
  p_join_code TEXT,
  p_max_members INTEGER,
  p_owner_id UUID,
  p_game_mode TEXT
)
RETURNS public.teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Invalid game mode';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.team_memberships
    WHERE user_id = p_owner_id
      AND game_mode = p_game_mode
  ) THEN
    RAISE EXCEPTION 'You are already a member of a team for this game mode';
  END IF;

  INSERT INTO public.teams (name, join_code, max_members, owner_id, game_mode, created_at)
  VALUES (p_name, p_join_code, p_max_members, p_owner_id, p_game_mode, now())
  RETURNING * INTO v_team;

  INSERT INTO public.team_memberships (team_id, user_id, role, game_mode, joined_at)
  VALUES (v_team.id, p_owner_id, 'owner', p_game_mode, now());

  IF p_game_mode = 'pvp' THEN
    INSERT INTO public.user_system (user_id, pvp_team_id, updated_at)
    VALUES (p_owner_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET pvp_team_id = EXCLUDED.pvp_team_id, updated_at = EXCLUDED.updated_at;
  ELSIF p_game_mode = 'pve' THEN
    INSERT INTO public.user_system (user_id, pve_team_id, updated_at)
    VALUES (p_owner_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET pve_team_id = EXCLUDED.pve_team_id, updated_at = EXCLUDED.updated_at;
  ELSE
    INSERT INTO public.user_system (user_id, seasonal_team_id, updated_at)
    VALUES (p_owner_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET seasonal_team_id = EXCLUDED.seasonal_team_id, updated_at = EXCLUDED.updated_at;
  END IF;

  INSERT INTO public.team_events (
    team_id,
    event_type,
    initiated_by,
    event_data,
    created_at
  )
  VALUES (
    v_team.id,
    'team_created',
    p_owner_id,
    jsonb_build_object('team_name', v_team.name, 'max_members', v_team.max_members),
    now()
  );
  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_with_owner(TEXT, TEXT, INTEGER, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_with_owner(TEXT, TEXT, INTEGER, UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.join_team(
  p_team_id UUID,
  p_join_code TEXT,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_member_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;
  IF v_team.join_code IS NULL OR p_join_code IS NULL OR v_team.join_code <> p_join_code THEN
    RAISE EXCEPTION 'Invalid team join code';
  END IF;
  IF v_team.game_mode NOT IN ('pvp', 'pve', 'seasonal') THEN
    RAISE EXCEPTION 'Team has invalid game mode';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.team_memberships
    WHERE user_id = p_user_id
      AND game_mode = v_team.game_mode
  ) THEN
    RAISE EXCEPTION 'You are already a member of a team for this game mode';
  END IF;

  SELECT count(*)
  INTO v_member_count
  FROM public.team_memberships
  WHERE team_id = v_team.id;
  IF v_member_count >= COALESCE(v_team.max_members, 5) THEN
    RAISE EXCEPTION 'Team is full';
  END IF;

  INSERT INTO public.team_memberships (
    team_id,
    user_id,
    role,
    game_mode,
    joined_at
  )
  VALUES (v_team.id, p_user_id, 'member', v_team.game_mode, now());

  IF v_team.game_mode = 'pvp' THEN
    INSERT INTO public.user_system (user_id, pvp_team_id, updated_at)
    VALUES (p_user_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET pvp_team_id = EXCLUDED.pvp_team_id, updated_at = EXCLUDED.updated_at;
  ELSIF v_team.game_mode = 'pve' THEN
    INSERT INTO public.user_system (user_id, pve_team_id, updated_at)
    VALUES (p_user_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET pve_team_id = EXCLUDED.pve_team_id, updated_at = EXCLUDED.updated_at;
  ELSE
    INSERT INTO public.user_system (user_id, seasonal_team_id, updated_at)
    VALUES (p_user_id, v_team.id, now())
    ON CONFLICT (user_id) DO UPDATE
    SET seasonal_team_id = EXCLUDED.seasonal_team_id, updated_at = EXCLUDED.updated_at;
  END IF;

  INSERT INTO public.team_events (
    team_id,
    event_type,
    target_user,
    initiated_by,
    event_data,
    created_at
  )
  VALUES (
    v_team.id,
    'member_joined',
    p_user_id,
    p_user_id,
    jsonb_build_object('team_name', v_team.name),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_team(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_team(UUID, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.join_team(
  p_team_id UUID,
  p_join_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.join_team(p_team_id, p_join_code, (SELECT auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.join_team(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_team(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_user_system_team_memberships()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.game_mode = 'seasonal' THEN
      UPDATE public.user_system
      SET seasonal_team_id = NEW.team_id, updated_at = now()
      WHERE user_id = NEW.user_id;
    ELSIF NEW.game_mode = 'pve' THEN
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
      UPDATE public.user_system
      SET seasonal_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND seasonal_team_id = OLD.team_id;
    ELSIF OLD.game_mode = 'pve' THEN
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
    ELSIF OLD.game_mode = 'seasonal' THEN
      UPDATE public.user_system
      SET seasonal_team_id = NULL, updated_at = now()
      WHERE user_id = OLD.user_id AND seasonal_team_id = OLD.team_id;
    END IF;
  END IF;

  IF NEW.game_mode = 'seasonal' THEN
    UPDATE public.user_system
    SET seasonal_team_id = NEW.team_id, updated_at = now()
    WHERE user_id = NEW.user_id;
  ELSIF NEW.game_mode = 'pve' THEN
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
  ADD CONSTRAINT api_tokens_game_mode_check CHECK (game_mode IN ('pvp', 'pve', 'seasonal'))
  NOT VALID;
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_token_value_game_mode_match;
ALTER TABLE public.api_tokens
  ADD CONSTRAINT api_tokens_token_value_game_mode_match
  CHECK (
    token_value IS NULL
    OR token_value LIKE (CASE game_mode
      WHEN 'pvp' THEN 'PVP\_%'
      WHEN 'pve' THEN 'PVE\_%'
      WHEN 'seasonal' THEN 'SZN\_%'
    END) ESCAPE '\'
  )
  NOT VALID;

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

  PERFORM 1 FROM public.user_progress WHERE user_id = p_user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  INSERT INTO public.user_game_mode_progress (
    user_id,
    game_mode,
    season_number,
    progress_data
  )
  SELECT
    p_user_id,
    v_game_mode,
    v_season_number,
    CASE v_game_mode
      WHEN 'pvp' THEN pvp_data
      WHEN 'pve' THEN pve_data
      ELSE '{}'::jsonb
    END
  FROM public.user_progress
  WHERE user_id = p_user_id
  ON CONFLICT (user_id, game_mode, season_number) DO NOTHING;

  SELECT progress_data
  INTO v_data
  FROM public.user_game_mode_progress
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number
  FOR UPDATE;

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

  UPDATE public.user_game_mode_progress
  SET progress_data = v_data
  WHERE user_id = p_user_id
    AND game_mode = v_game_mode
    AND season_number = v_season_number;

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

CREATE OR REPLACE FUNCTION public.archive_prestige_run_and_reset_progress(
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_mode NOT IN ('pvp', 'pve') THEN
    RAISE EXCEPTION 'Prestige is not supported for %', p_mode;
  END IF;

  INSERT INTO public.user_prestige_runs (
    user_id,
    mode,
    prestige_from,
    prestige_to,
    archived_progress,
    summary,
    created_at
  )
  VALUES (
    v_user_id,
    p_mode,
    p_prestige_from,
    p_prestige_to,
    public.sanitize_user_progress_mode_data(COALESCE(p_archived_progress, '{}'::jsonb)),
    COALESCE(p_summary, '{}'::jsonb),
    COALESCE(p_created_at, now())
  );

  -- p_modes omits 'seasonal' so a prestige can never write the Seasonal row.
  PERFORM public.sync_user_game_mode_progress(
    p_current_game_mode,
    p_game_edition,
    p_tarkov_uid,
    jsonb_build_object(
      'pvp', COALESCE(p_pvp_data, '{}'::jsonb),
      'pve', COALESCE(p_pve_data, '{}'::jsonb)
    ),
    NULL::SMALLINT
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
