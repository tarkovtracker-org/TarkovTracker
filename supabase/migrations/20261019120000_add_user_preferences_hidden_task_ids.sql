-- Task IDs the user hid from task lists. View-only: never read by progress or unlock logic.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS hidden_task_ids JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'user_preferences_hidden_task_ids_array_check'
      AND t.relname = 'user_preferences'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_hidden_task_ids_array_check
      CHECK (hidden_task_ids IS NULL OR jsonb_typeof(hidden_task_ids) = 'array');
  END IF;
END $$;
