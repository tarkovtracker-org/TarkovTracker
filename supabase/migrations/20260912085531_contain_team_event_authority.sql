-- The migration runner wraps this file in one transaction; fail instead of waiting indefinitely.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Preserve history without asserting that formerly client-writable events are trusted.
ALTER TABLE public.team_events ADD COLUMN server_verified BOOLEAN NOT NULL DEFAULT FALSE;

REVOKE INSERT ON public.team_events FROM PUBLIC, anon, authenticated;
DO $$
DECLARE column_name TEXT;
BEGIN
  FOR column_name IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.team_events'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE INSERT (%I) ON public.team_events FROM PUBLIC, anon, authenticated', column_name);
  END LOOP;
END;
$$;
DROP POLICY IF EXISTS "System or owners can create team events" ON public.team_events;
-- Defense against a future inherited INSERT grant or another permissive policy.
CREATE POLICY team_events_deny_client_insert ON public.team_events
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (FALSE);
GRANT SELECT, INSERT ON public.team_events TO service_role;
GRANT SELECT ON public.team_events TO authenticated;

CREATE FUNCTION public.stamp_server_team_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.server_verified := TRUE;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_server_team_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_server_team_event() TO service_role;
CREATE TRIGGER stamp_server_team_event BEFORE INSERT ON public.team_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_server_team_event();
