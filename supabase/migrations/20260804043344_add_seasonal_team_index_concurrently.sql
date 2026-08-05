-- supabase:disable-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_system_seasonal_team_id
  ON public.user_system(seasonal_team_id);
