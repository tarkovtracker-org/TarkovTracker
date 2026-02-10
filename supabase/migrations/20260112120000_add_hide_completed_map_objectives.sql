ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS hide_completed_map_objectives BOOLEAN DEFAULT FALSE;
