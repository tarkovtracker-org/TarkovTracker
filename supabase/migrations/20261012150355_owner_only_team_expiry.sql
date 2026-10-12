SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Schema only: no legacy backfill, clock activation, scheduling or deletion at merge.
ALTER TABLE public.teams
  ADD COLUMN owner_only_since timestamptz,
  ADD COLUMN owner_only_expires_at timestamptz,
  ADD CONSTRAINT teams_owner_only_clock_pair CHECK (
    (owner_only_since IS NULL) = (owner_only_expires_at IS NULL)
  );
CREATE INDEX teams_owner_only_expiry ON public.teams(owner_only_expires_at, id)
  WHERE owner_only_expires_at IS NOT NULL;

CREATE TABLE private.owner_only_team_cleanup (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  warnings_started_at timestamptz,
  deletion_enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE private.owner_only_team_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.owner_only_team_cleanup FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.owner_only_team_cleanup(singleton) VALUES (true);

-- Exactly one actual membership, matching the owner, role and mode. Empty and inconsistent
-- teams are deliberately excluded, even if a stale clock exists.
CREATE FUNCTION private.team_is_owner_only(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(*) = 1 AND coalesce(bool_and(
    m.user_id = t.owner_id AND m.role = 'owner' AND m.game_mode = t.game_mode
  ), false)
  FROM public.teams t JOIN public.team_memberships m ON m.team_id = t.id
  WHERE t.id = p_team_id;
$$;
REVOKE ALL ON FUNCTION private.team_is_owner_only(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The caller holds the team lock. Ordinary activity and team metadata never call this.
CREATE FUNCTION private.refresh_owner_only_team_clock(p_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_since timestamptz;
BEGIN
  IF (SELECT warnings_started_at IS NULL FROM private.owner_only_team_cleanup) THEN RETURN; END IF;
  SELECT CASE WHEN private.team_is_owner_only(id)
    THEN coalesce(owner_only_since, clock_timestamp()) END INTO v_since
  FROM public.teams WHERE id = p_team_id;
  UPDATE public.teams SET owner_only_since = v_since,
    owner_only_expires_at = v_since + interval '168 hours'
  WHERE id = p_team_id AND owner_only_since IS DISTINCT FROM v_since;
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_owner_only_team_clock(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- RPCs already own this lock. FK account deletion holds a membership tuple first: NOWAIT
-- aborts that transaction on contention (55P03) instead of introducing a reverse-order wait.
-- Lock BEFORE INSERT also precedes the parent FK check and the user_system AFTER trigger.
CREATE FUNCTION private.lock_owner_only_team_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.team_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.team_id; END IF;
  PERFORM id FROM public.teams WHERE id IN (v_old, v_new) ORDER BY id FOR UPDATE NOWAIT;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_owner_only_team_membership() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER owner_only_team_lock BEFORE INSERT OR UPDATE OR DELETE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION private.lock_owner_only_team_membership();

CREATE FUNCTION private.track_owner_only_team_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM private.refresh_owner_only_team_clock(OLD.team_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM private.refresh_owner_only_team_clock(NEW.team_id); END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.track_owner_only_team_membership() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER owner_only_team_clock AFTER INSERT OR UPDATE OR DELETE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION private.track_owner_only_team_membership();

CREATE FUNCTION private.track_owner_only_team_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.refresh_owner_only_team_clock(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.track_owner_only_team_owner() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER owner_only_team_owner AFTER UPDATE OF owner_id, game_mode ON public.teams
  FOR EACH ROW EXECUTE FUNCTION private.track_owner_only_team_owner();

-- Explicit, idempotent operator step AFTER warning UI verification. No account activity can
-- call this or reset it. The bounded runner initializes legacy solo teams from fresh DB time.
CREATE FUNCTION private.begin_owner_only_team_warnings()
RETURNS timestamptz LANGUAGE sql SET search_path = '' AS $$
  UPDATE private.owner_only_team_cleanup
  SET warnings_started_at = coalesce(warnings_started_at, clock_timestamp())
  RETURNING warnings_started_at;
$$;
REVOKE ALL ON FUNCTION private.begin_owner_only_team_warnings() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.run_owner_only_team_cleanup(p_limit integer DEFAULT 100)
RETURNS TABLE(initialized integer, disbanded integer)
LANGUAGE plpgsql SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_team record; v_warning timestamptz; v_enabled boolean; v_since timestamptz; v_expiry timestamptz; v_owner uuid;
BEGIN
  initialized := 0; disbanded := 0;
  SELECT warnings_started_at, deletion_enabled INTO v_warning, v_enabled
  FROM private.owner_only_team_cleanup FOR SHARE;
  IF v_warning IS NULL THEN RETURN NEXT; RETURN; END IF;
  -- Bound the scan's returned/locked rows; skip active mutations, never wait on their team.
  FOR v_team IN SELECT t.id FROM public.teams t
    WHERE (t.owner_only_since IS NULL OR t.owner_only_expires_at <= clock_timestamp())
      AND private.team_is_owner_only(t.id)
    ORDER BY t.owner_only_expires_at NULLS FIRST, t.id
    LIMIT greatest(1, least(coalesce(p_limit, 100), 100)) FOR UPDATE SKIP LOCKED
  LOOP
    -- A separate statement AFTER acquiring the shared lifecycle lock uses a fresh snapshot.
    IF NOT private.team_is_owner_only(v_team.id) THEN CONTINUE; END IF;
    SELECT owner_id, owner_only_since, owner_only_expires_at INTO v_owner, v_since, v_expiry
      FROM public.teams WHERE id = v_team.id;
    IF v_since IS NULL THEN
      PERFORM private.refresh_owner_only_team_clock(v_team.id);
      initialized := initialized + 1;
    ELSIF v_enabled AND greatest(v_expiry, v_warning + interval '168 hours') <= clock_timestamp() THEN
      PERFORM public.disband_team(v_team.id, v_owner);
      disbanded := disbanded + 1;
    END IF;
  END LOOP;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION private.run_owner_only_team_cleanup(integer) FROM PUBLIC, anon, authenticated, service_role;
