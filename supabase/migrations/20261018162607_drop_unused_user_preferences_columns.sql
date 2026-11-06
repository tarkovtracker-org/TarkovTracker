-- Retired UI preferences are omitted by current clients; keep cached-client sanitizers.
-- Apply through the transactional migration runner. A committed drop destroys stored values.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.user_preferences
  DROP COLUMN hideout_sort_ready_first RESTRICT,
  DROP COLUMN hideout_collapse_completed RESTRICT,
  DROP COLUMN task_card_density RESTRICT,
  DROP COLUMN show_task_ids RESTRICT,
  DROP COLUMN show_not_required_labels RESTRICT,
  DROP COLUMN enable_holiday_effects RESTRICT,
  DROP COLUMN neededitems_style RESTRICT;
