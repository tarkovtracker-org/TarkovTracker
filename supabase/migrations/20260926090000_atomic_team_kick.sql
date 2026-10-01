SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Membership deletion, cooldown check, and trusted event commit together. An event
-- failure rolls the kick back instead of leaving a removed member without audit history,
-- which would otherwise defeat the `member_kicked` cooldown in `checkCooldown`.
CREATE FUNCTION public.kick_team(p_team_id UUID, p_initiator_id UUID, p_member_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE v_mode TEXT; v_role TEXT; v_now TIMESTAMPTZ;
BEGIN
  IF p_team_id IS NULL OR p_initiator_id IS NULL OR p_member_id IS NULL THEN RETURN 'not_found'; END IF;
  -- Serialize per initiating owner before team rows, matching the leave RPC lock order.
  PERFORM pg_advisory_xact_lock(hashtext('team-kick'), hashtext(p_initiator_id::TEXT));
  SELECT game_mode INTO v_mode FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT role INTO v_role FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_initiator_id FOR UPDATE;
  -- The handler never reveals membership as distinct from team existence to non-owners.
  IF NOT FOUND OR v_role IS DISTINCT FROM 'owner' THEN RETURN 'not_owner'; END IF;
  IF p_member_id = p_initiator_id THEN RETURN 'self'; END IF;
  v_now := clock_timestamp();
  -- Cooldown filters on server_verified, initiated_by, and current-time bounds exactly
  -- as the Edge handler does; both paths now agree inside one transaction.
  IF EXISTS(SELECT 1 FROM public.team_events e JOIN public.teams t ON t.id=e.team_id
    WHERE e.event_type='member_kicked' AND e.initiated_by=p_initiator_id
      AND e.server_verified AND t.game_mode=v_mode
      AND e.created_at BETWEEN v_now-INTERVAL '5 minutes' AND v_now)
  THEN RETURN 'cooldown'; END IF;
  DELETE FROM public.team_memberships WHERE team_id=p_team_id AND user_id=p_member_id;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;
  INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by)
    VALUES(p_team_id,'member_kicked',p_member_id,p_initiator_id);
  RETURN 'kicked';
END;
$$;
REVOKE ALL ON FUNCTION public.kick_team(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_team(UUID,UUID,UUID) TO service_role;
