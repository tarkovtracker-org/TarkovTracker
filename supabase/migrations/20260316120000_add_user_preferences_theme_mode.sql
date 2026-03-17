ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';

UPDATE public.user_preferences
SET theme_mode = 'dark'
WHERE theme_mode IS NULL;

ALTER TABLE public.user_preferences
  ALTER COLUMN theme_mode SET DEFAULT 'dark',
  ALTER COLUMN theme_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'user_preferences_theme_mode_check'
      AND t.relname = 'user_preferences'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_theme_mode_check
      CHECK (theme_mode IN ('dark', 'light'));
  END IF;
END $$;
