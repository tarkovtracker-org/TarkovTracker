SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Leave/kick cooldowns previously read team_events through teams, so disbanding a team
-- cascaded the evidence away (#646). Keep one durable row per user, mode and action.
CREATE TABLE private.team_action_cooldowns (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_mode text NOT NULL,
  action text NOT NULL CHECK (action IN ('leave', 'kick')),
  last_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, game_mode, action)
);
ALTER TABLE private.team_action_cooldowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.team_action_cooldowns FROM PUBLIC, anon, authenticated;

-- Checks and advances the caller's cooldown in one statement. Callers invoke it in the same
-- transaction as the membership change, so any later failure also discards the advance.
-- Transitional: leaves/kicks committed by the previous RPC bodies (before or while this
-- migration applies) wrote only team_events, so verified events in the window still block.
CREATE FUNCTION private.claim_team_action_cooldown(p_user_id uuid, p_mode text, p_action text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_events e JOIN public.teams t ON t.id = e.team_id
    WHERE e.event_type = CASE p_action WHEN 'leave' THEN 'member_left' ELSE 'member_kicked' END
      AND e.initiated_by = p_user_id AND e.server_verified AND t.game_mode = p_mode
      AND (p_action = 'kick' OR e.target_user = p_user_id)
      AND e.created_at BETWEEN v_now - INTERVAL '5 minutes' AND v_now)
  THEN RETURN FALSE; END IF;
  INSERT INTO private.team_action_cooldowns AS c(user_id, game_mode, action, last_at)
  VALUES (p_user_id, p_mode, p_action, v_now)
  ON CONFLICT (user_id, game_mode, action) DO UPDATE SET last_at = EXCLUDED.last_at
  WHERE c.last_at NOT BETWEEN v_now - INTERVAL '5 minutes' AND v_now;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION private.claim_team_action_cooldown(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Same signature, lock order, results and grants as 20260912085904; only the cooldown source changes.
CREATE OR REPLACE FUNCTION public.leave_team(p_team_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE v_mode TEXT; v_role TEXT;
BEGIN
  IF p_team_id IS NULL OR p_user_id IS NULL THEN RETURN 'not_member'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('team-leave'), hashtext(p_user_id::TEXT));
  SELECT game_mode INTO v_mode FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT role INTO v_role FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;
  IF v_role='owner' THEN RETURN 'owner'; END IF;
  IF NOT private.claim_team_action_cooldown(p_user_id, v_mode, 'leave') THEN RETURN 'cooldown'; END IF;
  DELETE FROM public.team_memberships WHERE team_id=p_team_id AND user_id=p_user_id;
  INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by)
    VALUES(p_team_id,'member_left',p_user_id,p_user_id);
  RETURN 'left';
END;
$$;
REVOKE ALL ON FUNCTION public.leave_team(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_team(UUID,UUID) TO service_role;

-- Same signature, lock order, results and grants as 20260926090000; only the cooldown source changes.
CREATE OR REPLACE FUNCTION public.kick_team(p_team_id UUID, p_initiator_id UUID, p_member_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE v_mode TEXT; v_role TEXT;
BEGIN
  IF p_team_id IS NULL OR p_initiator_id IS NULL OR p_member_id IS NULL THEN RETURN 'not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('team-kick'), hashtext(p_initiator_id::TEXT));
  SELECT game_mode INTO v_mode FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT role INTO v_role FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_initiator_id FOR UPDATE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'owner' THEN RETURN 'not_owner'; END IF;
  IF p_member_id = p_initiator_id THEN RETURN 'self'; END IF;
  PERFORM 1 FROM public.team_memberships
    WHERE team_id=p_team_id AND user_id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;
  IF NOT private.claim_team_action_cooldown(p_initiator_id, v_mode, 'kick') THEN RETURN 'cooldown'; END IF;
  DELETE FROM public.team_memberships WHERE team_id=p_team_id AND user_id=p_member_id;
  INSERT INTO public.team_events(team_id,event_type,target_user,initiated_by)
    VALUES(p_team_id,'member_kicked',p_member_id,p_initiator_id);
  RETURN 'kicked';
END;
$$;
REVOKE ALL ON FUNCTION public.kick_team(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_team(UUID,UUID,UUID) TO service_role;
