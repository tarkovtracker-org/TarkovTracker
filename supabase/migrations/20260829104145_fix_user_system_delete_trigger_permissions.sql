CREATE OR REPLACE FUNCTION public.sync_user_system_team_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

ALTER FUNCTION public.sync_user_system_team_memberships() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_user_system_team_memberships() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_system_team_memberships() TO service_role;
