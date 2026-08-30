DROP POLICY IF EXISTS "Team members can receive team broadcasts" ON realtime.messages;
CREATE POLICY "Team members can receive team broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships membership
      WHERE membership.user_id = (SELECT auth.uid())
        AND concat('team:', membership.team_id::text) = (SELECT realtime.topic())
    )
  );

DROP POLICY IF EXISTS "Team members can send team broadcasts" ON realtime.messages;
CREATE POLICY "Team members can send team broadcasts"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships membership
      WHERE membership.user_id = (SELECT auth.uid())
        AND concat('team:', membership.team_id::text) = (SELECT realtime.topic())
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_system'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_system;
  END IF;
END;
$$;
