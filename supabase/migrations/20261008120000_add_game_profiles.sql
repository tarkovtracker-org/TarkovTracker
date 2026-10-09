-- Game profiles: a second EFT account's progress under one TarkovTracker account.
--
-- The account's existing progress (`user_game_mode_progress`, `user_progress`) is its default
-- profile and is not touched, so every existing reader, team, token, shared link and overlay keeps
-- reading exactly what it reads today. Extra profiles live in their own tables, so a reader that
-- does not know about profiles can never see or mix their data. Preferences stay account-global.
-- No existing row is rewritten; an account gets a `user_game_profiles` row only when it binds an
-- EFT account id or adds a profile. The default-profile row is created lazily.
--
-- Access: the default profile is never gated. Adding or writing an extra profile requires an active
-- supporter (same activity rule as the app) unless `app_settings.game_profiles_access` is 'all'.
-- A lapsed supporter keeps the profile read-only and may still delete it.

CREATE TABLE public.user_game_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  eft_account_id TEXT,
  game_edition INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_game_profiles_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT user_game_profiles_label_check
    CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 40),
  CONSTRAINT user_game_profiles_eft_account_id_check
    CHECK (eft_account_id IS NULL OR eft_account_id ~ '^[A-Za-z0-9_-]{1,64}$')
);

CREATE UNIQUE INDEX user_game_profiles_one_default
  ON public.user_game_profiles (user_id) WHERE is_default;
CREATE UNIQUE INDEX user_game_profiles_user_eft_account_unique
  ON public.user_game_profiles (user_id, eft_account_id) WHERE eft_account_id IS NOT NULL;
CREATE INDEX user_game_profiles_user_created_idx
  ON public.user_game_profiles (user_id, created_at, id);

ALTER TABLE public.user_game_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_game_profiles FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.user_game_profiles IS
  'EFT game profiles of one account. The is_default row describes the existing progress rows; other rows own user_profile_mode_progress.';

CREATE TABLE public.user_profile_mode_progress (
  profile_id UUID NOT NULL,
  user_id UUID NOT NULL,
  game_mode TEXT NOT NULL,
  season_number SMALLINT NOT NULL DEFAULT 0,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, game_mode, season_number),
  CONSTRAINT user_profile_mode_progress_profile_fkey
    FOREIGN KEY (profile_id, user_id)
    REFERENCES public.user_game_profiles (id, user_id) ON DELETE CASCADE,
  CONSTRAINT user_profile_mode_progress_game_mode_check
    CHECK (game_mode IN ('pvp', 'pve', 'seasonal')),
  CONSTRAINT user_profile_mode_progress_season_check
    CHECK (
      (game_mode IN ('pvp', 'pve') AND season_number = 0)
      OR (game_mode = 'seasonal' AND season_number > 0)
    )
);

ALTER TABLE public.user_profile_mode_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_profile_mode_progress FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.user_profile_mode_progress IS
  'Per-mode progress of a non-default game profile. Same shape as user_game_mode_progress; clients use RPCs.';

CREATE FUNCTION private.game_profiles_unlocked(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
      (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'game_profiles_access'),
      'supporters') = 'all'
    OR (
      NOT public.supporter_benefits_disqualified(p_user_id)
      AND EXISTS (
        SELECT 1 FROM public.supporters s
        WHERE s.user_id = p_user_id
          AND ((s.status = 'active' AND s.expires_at IS NULL)
            OR (s.status IN ('active', 'past_due') AND s.expires_at > now()))
      )
    );
$$;
REVOKE ALL ON FUNCTION private.game_profiles_unlocked(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.consume_game_profile_rate_limit(p_user_id UUID, p_scope TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  SELECT allowed INTO v_allowed
  FROM public.consume_mutation_rate_limit(p_scope, p_user_id::TEXT, 60, 60);
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Game profile rate limit exceeded';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.consume_game_profile_rate_limit(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.ensure_default_game_profile(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('game-profiles:' || p_user_id::TEXT, 0));
  SELECT id INTO v_id FROM public.user_game_profiles
  WHERE user_id = p_user_id AND is_default;
  IF v_id IS NULL THEN
    INSERT INTO public.user_game_profiles (user_id, is_default)
    VALUES (p_user_id, true) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_default_game_profile(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.game_profile_json(p_profile_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'is_default', is_default,
    'label', label,
    'eft_account_id', eft_account_id,
    'game_edition', game_edition,
    'created_at', created_at)
  FROM public.user_game_profiles WHERE id = p_profile_id;
$$;
REVOKE ALL ON FUNCTION private.game_profile_json(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_game_profiles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_max_profiles CONSTANT INTEGER := 2;
  v_count INTEGER;
  v_has_default BOOLEAN;
  v_unlocked BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT count(*), COALESCE(bool_or(is_default), false) INTO v_count, v_has_default
  FROM public.user_game_profiles WHERE user_id = v_user_id;
  v_unlocked := private.game_profiles_unlocked(v_user_id);
  RETURN jsonb_build_object(
    'profiles', COALESCE((
      SELECT jsonb_agg(private.game_profile_json(id) ORDER BY is_default DESC, created_at, id)
      FROM public.user_game_profiles WHERE user_id = v_user_id), '[]'::jsonb),
    'max_profiles', v_max_profiles,
    'unlocked', v_unlocked,
    'can_add', v_unlocked
      AND (v_count + CASE WHEN v_has_default THEN 0 ELSE 1 END) < v_max_profiles);
END;
$$;

CREATE FUNCTION public.add_game_profile(p_label TEXT, p_eft_account_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_label TEXT := NULLIF(btrim(p_label), '');
  v_eft TEXT := NULLIF(btrim(p_eft_account_id), '');
  v_new UUID;
  v_max_profiles CONSTANT INTEGER := 2;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM private.consume_game_profile_rate_limit(v_user_id, 'game-profile');
  IF NOT private.game_profiles_unlocked(v_user_id) THEN
    RAISE EXCEPTION 'Game profiles require supporter access' USING ERRCODE = 'PT403';
  END IF;
  PERFORM private.ensure_default_game_profile(v_user_id);
  IF (SELECT count(*) FROM public.user_game_profiles WHERE user_id = v_user_id)
    >= v_max_profiles THEN
    RAISE EXCEPTION 'Game profile limit reached' USING ERRCODE = 'PT422';
  END IF;
  BEGIN
    INSERT INTO public.user_game_profiles (user_id, label, eft_account_id)
    VALUES (v_user_id, v_label, v_eft)
    RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Game profile already exists for this account' USING ERRCODE = 'PT409';
  END;
  RETURN jsonb_build_object('profile', private.game_profile_json(v_new));
END;
$$;

-- NULL p_profile_id addresses the default profile. NULL values leave a field unchanged; an empty
-- string clears it. Binding the default profile's EFT account id is never gated.
CREATE FUNCTION public.update_game_profile(
  p_profile_id UUID,
  p_label TEXT,
  p_eft_account_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_id UUID := p_profile_id;
  v_default BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM private.consume_game_profile_rate_limit(v_user_id, 'game-profile');
  IF v_id IS NULL THEN
    v_id := private.ensure_default_game_profile(v_user_id);
  END IF;
  SELECT is_default INTO v_default FROM public.user_game_profiles
  WHERE id = v_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game profile not found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT v_default AND NOT private.game_profiles_unlocked(v_user_id) THEN
    RAISE EXCEPTION 'Game profiles require supporter access' USING ERRCODE = 'PT403';
  END IF;
  BEGIN
    UPDATE public.user_game_profiles
    SET
      label = CASE WHEN p_label IS NULL THEN label ELSE NULLIF(btrim(p_label), '') END,
      eft_account_id = CASE WHEN p_eft_account_id IS NULL THEN eft_account_id
        ELSE NULLIF(btrim(p_eft_account_id), '') END,
      updated_at = now()
    WHERE id = v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Game profile already exists for this account' USING ERRCODE = 'PT409';
  END;
  RETURN jsonb_build_object('profile', private.game_profile_json(v_id));
END;
$$;

-- Deleting stays available to lapsed supporters so they can free the stored progress.
CREATE FUNCTION public.delete_game_profile(p_profile_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_default BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM private.consume_game_profile_rate_limit(v_user_id, 'game-profile');
  SELECT is_default INTO v_default FROM public.user_game_profiles
  WHERE id = p_profile_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game profile not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_default THEN
    RAISE EXCEPTION 'The default game profile cannot be deleted' USING ERRCODE = 'PT409';
  END IF;
  DELETE FROM public.user_game_profiles WHERE id = p_profile_id;
END;
$$;

CREATE FUNCTION public.get_game_profile_progress(p_profile_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_default BOOLEAN;
  v_edition INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT is_default, game_edition INTO v_default, v_edition FROM public.user_game_profiles
  WHERE id = p_profile_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game profile not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_default THEN
    RAISE EXCEPTION 'The default game profile uses the standard progress tables'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN jsonb_build_object(
    'game_edition', v_edition,
    'modes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'game_mode', game_mode,
        'season_number', season_number,
        'progress_data', progress_data,
        'profile_public', profile_public,
        'updated_at', updated_at) ORDER BY game_mode, season_number)
      FROM public.user_profile_mode_progress WHERE profile_id = p_profile_id), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.sync_game_profile_progress(
  p_profile_id UUID,
  p_game_edition INTEGER,
  p_modes JSONB,
  p_seasonal_season_number SMALLINT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  IF pg_column_size(p_modes) > 524288 THEN
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
        public.merge_manual_activity_progress(COALESCE(v_existing, v_empty_object), v_progress))
    )
    ON CONFLICT (profile_id, game_mode, season_number) DO UPDATE
    SET progress_data = EXCLUDED.progress_data, updated_at = now()
    WHERE user_profile_mode_progress.progress_data IS DISTINCT FROM EXCLUDED.progress_data;
  END LOOP;

  UPDATE public.user_game_profiles
  SET game_edition = p_game_edition, updated_at = now()
  WHERE id = p_profile_id AND game_edition IS DISTINCT FROM p_game_edition;

  RETURN jsonb_build_object('profile_id', p_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_game_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_game_profile(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_game_profile(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_game_profile(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_game_profile_progress(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_game_profile_progress(UUID, INTEGER, JSONB, SMALLINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_game_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_game_profile(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_game_profile(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_game_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_profile_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_game_profile_progress(UUID, INTEGER, JSONB, SMALLINT)
  TO authenticated;
