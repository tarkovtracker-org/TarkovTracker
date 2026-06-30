-- Address Supabase advisor lint 0005 unused_index on several public tables.
--
-- idx_supporters_stripe_subscription duplicates uniq_supporters_stripe_subscription
-- (UNIQUE partial index on the same column from 20260522210000); every
-- stripe_subscription_id lookup uses the unique index, so the plain b-tree is
-- redundant write overhead.
--
-- idx_supporters_status, idx_teams_game_mode, and idx_team_memberships_game_mode
-- index low-cardinality CHECK-constrained columns ('active'/'past_due'/... and
-- 'pvp'/'pve'). Queries always pair game_mode/status with a selective column, so
-- the planner never chooses these 2-4 value indexes.
--
-- The account_deletion_jobs indexes are intentionally left in place: the reconcile
-- job filters by status and orders by next_run_at, so they back a real query path.
--
-- All safe to drop; recreate from history if access patterns change.

DROP INDEX IF EXISTS public.idx_supporters_stripe_subscription;
DROP INDEX IF EXISTS public.idx_supporters_status;
DROP INDEX IF EXISTS public.idx_teams_game_mode;
DROP INDEX IF EXISTS public.idx_team_memberships_game_mode;
