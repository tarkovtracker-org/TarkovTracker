DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'only_tasks_with_suggested_keys'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'only_tasks_with_required_keys'
  ) THEN
    ALTER TABLE public.user_preferences
      RENAME COLUMN only_tasks_with_suggested_keys TO only_tasks_with_required_keys;
  END IF;
END $$;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS only_tasks_with_required_keys BOOLEAN DEFAULT FALSE NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'only_tasks_with_suggested_keys'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'only_tasks_with_required_keys'
  ) THEN
    UPDATE public.user_preferences
    SET only_tasks_with_required_keys = COALESCE(only_tasks_with_suggested_keys, FALSE)
    WHERE only_tasks_with_required_keys IS DISTINCT FROM COALESCE(
      only_tasks_with_suggested_keys,
      FALSE
    );

    ALTER TABLE public.user_preferences
      DROP COLUMN only_tasks_with_suggested_keys;
  END IF;
END $$;
