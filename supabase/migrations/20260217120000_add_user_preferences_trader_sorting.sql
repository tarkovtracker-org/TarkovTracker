ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS trader_sort_mode TEXT,
  ADD COLUMN IF NOT EXISTS trader_sort_direction TEXT;

UPDATE public.user_preferences
SET trader_sort_mode = 'default'
WHERE trader_sort_mode IS NOT NULL
  AND trader_sort_mode NOT IN ('default', 'progress', 'level');

UPDATE public.user_preferences
SET trader_sort_direction = 'desc'
WHERE trader_sort_direction IS NOT NULL
  AND trader_sort_direction NOT IN ('asc', 'desc');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_trader_sort_mode_check'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_trader_sort_mode_check
        CHECK (trader_sort_mode IS NULL OR trader_sort_mode IN ('default', 'progress', 'level'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_trader_sort_direction_check'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_trader_sort_direction_check
        CHECK (trader_sort_direction IS NULL OR trader_sort_direction IN ('asc', 'desc'));
  END IF;
END $$;
