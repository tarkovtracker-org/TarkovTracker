-- Enable Realtime on user_progress table for team sync
-- This allows teammates to receive real-time updates when other team members update their progress

-- Add user_progress table to the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_progress;
  END IF;
END $$;
