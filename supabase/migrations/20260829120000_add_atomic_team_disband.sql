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
  v_team_owner_id UUID;
BEGIN
  IF p_team_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Team and owner are required';
  END IF;

  SELECT owner_id
  INTO v_team_owner_id
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  IF v_team_owner_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Only team owners can disband this team';
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

  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.disband_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disband_team(UUID, UUID) TO service_role;
