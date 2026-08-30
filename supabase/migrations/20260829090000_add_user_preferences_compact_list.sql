ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS task_collapse_default BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hide_task_rewards BOOLEAN DEFAULT FALSE;
ALTER TABLE public.user_preferences
  ALTER COLUMN task_card_density SET DEFAULT 'comfortable';
