SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Aggregate receipts only; no account/team identifiers or payloads. The receipt commits or
-- rolls back with the entire active batch, including any disband failure.
CREATE TABLE private.owner_only_team_cleanup_receipts (
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  initialized integer NOT NULL CHECK (initialized BETWEEN 0 AND 100),
  disbanded integer NOT NULL CHECK (disbanded BETWEEN 0 AND 100),
  deletion_enabled boolean NOT NULL
);
CREATE INDEX owner_only_team_receipts_completed ON private.owner_only_team_cleanup_receipts(completed_at);
ALTER TABLE private.owner_only_team_cleanup_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.owner_only_team_cleanup_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.run_owner_only_team_cleanup(p_limit integer DEFAULT 100)
RETURNS TABLE(initialized integer, disbanded integer)
LANGUAGE plpgsql SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_team record; v_warning timestamptz; v_enabled boolean; v_since timestamptz; v_expiry timestamptz; v_owner uuid;
BEGIN
  initialized := 0; disbanded := 0;
  SELECT warnings_started_at, deletion_enabled INTO v_warning, v_enabled
  FROM private.owner_only_team_cleanup FOR SHARE;
  IF v_warning IS NULL THEN RETURN NEXT; RETURN; END IF;
  FOR v_team IN SELECT t.id FROM public.teams t
    WHERE (t.owner_only_since IS NULL OR t.owner_only_expires_at <= clock_timestamp())
      AND private.team_is_owner_only(t.id)
    ORDER BY t.owner_only_expires_at NULLS FIRST, t.id
    LIMIT greatest(1, least(coalesce(p_limit, 100), 100)) FOR UPDATE SKIP LOCKED
  LOOP
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
  INSERT INTO private.owner_only_team_cleanup_receipts(initialized, disbanded, deletion_enabled)
    VALUES (initialized, disbanded, v_enabled);
  -- Keep thirty days at the hourly cadence, pruning at most 100 older aggregate receipts.
  DELETE FROM private.owner_only_team_cleanup_receipts WHERE ctid IN (
    SELECT ctid FROM private.owner_only_team_cleanup_receipts
    WHERE completed_at < clock_timestamp() - interval '30 days'
    ORDER BY completed_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION private.run_owner_only_team_cleanup(integer) FROM PUBLIC, anon, authenticated, service_role;

-- Intentionally owner-evaluated, barrier-protected aggregate view. Grant this view alone to
-- the dedicated observer out of band; it needs no SELECT on teams, memberships or receipts.
CREATE VIEW private.owner_only_team_cleanup_status WITH (security_barrier = true) AS
WITH membership_state AS (
  SELECT t.id, t.owner_only_since, t.owner_only_expires_at,
    count(m.user_id) AS members,
    count(m.user_id) FILTER (WHERE m.user_id = t.owner_id AND m.role = 'owner'
      AND m.game_mode = t.game_mode) AS owner_members,
    count(m.user_id) FILTER (WHERE m.game_mode IS DISTINCT FROM t.game_mode
      OR (m.role = 'owner' AND m.user_id IS DISTINCT FROM t.owner_id)) AS mismatches
  FROM public.teams t LEFT JOIN public.team_memberships m ON m.team_id = t.id
  GROUP BY t.id
), counts AS (
  SELECT count(*) FILTER (WHERE members = 1 AND owner_members = 1) AS owner_only,
    count(*) FILTER (WHERE members > 1 AND owner_members = 1 AND mismatches = 0) AS populated,
    count(*) FILTER (WHERE members = 0) AS empty,
    count(*) FILTER (WHERE members > 0 AND (owner_members <> 1 OR mismatches > 0)) AS inconsistent,
    count(*) FILTER (WHERE members = 1 AND owner_members = 1 AND owner_only_since IS NULL) AS awaiting_clock,
    count(*) FILTER (WHERE members = 1 AND owner_members = 1 AND owner_only_expires_at > statement_timestamp()) AS in_grace,
    count(*) FILTER (WHERE members = 1 AND owner_members = 1 AND owner_only_expires_at <= statement_timestamp()) AS due
  FROM membership_state
)
SELECT counts.*, settings.warnings_started_at, settings.deletion_enabled,
  coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.completed_at DESC) FROM (
    SELECT completed_at, initialized, disbanded, deletion_enabled
    FROM private.owner_only_team_cleanup_receipts ORDER BY completed_at DESC LIMIT 20
  ) r), '[]'::jsonb) AS recent_receipts
FROM counts CROSS JOIN private.owner_only_team_cleanup settings;
REVOKE ALL ON private.owner_only_team_cleanup_status FROM PUBLIC, anon, authenticated, service_role;
