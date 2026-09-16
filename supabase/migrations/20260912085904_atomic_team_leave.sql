SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Membership deletion, conditional pointer trigger and trusted event commit together.
CREATE FUNCTION public.leave_team(p_team_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE v_mode TEXT; v_role TEXT; v_now TIMESTAMPTZ;
BEGIN
  IF p_team_id IS NULL OR p_user_id IS NULL THEN RETURN 'not_member'; END IF;
  -- C is independent of deletion preparation: serialize only this user before team rows.
  PERFORM pg_advisory_xact_lock(hashtext('team-leave'), hashtext(p_user_id::TEXT));
  SELECT game_mode INTO v_mode FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT role INTO v_role FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;
  IF v_role='owner' THEN RETURN 'owner'; END IF;
  v_now := clock_timestamp();
  IF EXISTS(SELECT 1 FROM public.team_events e JOIN public.teams t ON t.id=e.team_id
    WHERE e.event_type='member_left' AND e.target_user=p_user_id AND e.initiated_by=p_user_id
      AND e.server_verified AND t.game_mode=v_mode
      AND e.created_at BETWEEN v_now-INTERVAL '5 minutes' AND v_now)
  THEN RETURN 'cooldown'; END IF;
  DELETE FROM public.team_memberships WHERE team_id=p_team_id AND user_id=p_user_id;
  INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by)
    VALUES(p_team_id,'member_left',p_user_id,p_user_id);
  RETURN 'left';
END;
$$;
REVOKE ALL ON FUNCTION public.leave_team(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_team(UUID,UUID) TO service_role;

-- Validate ownership under the same team-first row lock used by join, leave and disband.
-- Otherwise transfer can validate a member, wait for leave, then promote a departed member.
CREATE OR REPLACE FUNCTION public.transfer_team_ownership(
  p_team_id UUID, p_old_owner_id UUID, p_new_owner_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM p_old_owner_id THEN
    RAISE EXCEPTION 'User % is not the owner of team %', p_old_owner_id, p_team_id;
  END IF;
  PERFORM 1 FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_new_owner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'New owner (%) is not a member of team %', p_new_owner_id, p_team_id;
  END IF;
  UPDATE public.teams SET owner_id=p_new_owner_id WHERE id=p_team_id;
  UPDATE public.team_memberships SET role='owner'
    WHERE team_id=p_team_id AND user_id=p_new_owner_id;
  UPDATE public.team_memberships SET role='member'
    WHERE team_id=p_team_id AND user_id=p_old_owner_id AND user_id<>p_new_owner_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_team_ownership(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_team_ownership(UUID,UUID,UUID) TO service_role;
