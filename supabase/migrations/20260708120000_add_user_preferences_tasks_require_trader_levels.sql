ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tasks_require_trader_levels BOOLEAN NOT NULL DEFAULT TRUE;
