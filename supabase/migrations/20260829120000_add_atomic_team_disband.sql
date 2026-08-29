CREATE OR REPLACE FUNCTION public.disband_team(
  p_team_id UUID,
  p_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_team_id UUID;
BEGIN
  IF p_team_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Team and owner are required';
  END IF;

  UPDATE public.user_system
  SET pvp_team_id = CASE WHEN pvp_team_id = p_team_id THEN NULL ELSE pvp_team_id END,
      pve_team_id = CASE WHEN pve_team_id = p_team_id THEN NULL ELSE pve_team_id END,
      seasonal_team_id = CASE
        WHEN seasonal_team_id = p_team_id THEN NULL
        ELSE seasonal_team_id
      END,
      updated_at = now()
  WHERE pvp_team_id = p_team_id
     OR pve_team_id = p_team_id
     OR seasonal_team_id = p_team_id;

  DELETE FROM public.teams
  WHERE id = p_team_id
    AND owner_id = p_owner_id
  RETURNING id INTO v_deleted_team_id;

  IF v_deleted_team_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'Only team owners can disband this team';
  END IF;

  RAISE EXCEPTION 'Team not found';
END;
$$;

REVOKE ALL ON FUNCTION public.disband_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disband_team(UUID, UUID) TO service_role;
