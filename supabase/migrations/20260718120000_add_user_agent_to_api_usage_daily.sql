ALTER TABLE public.api_usage_daily
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_api_usage_daily_user_agent
  ON public.api_usage_daily(user_agent)
  WHERE user_agent IS NOT NULL;

DROP FUNCTION public.record_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER);

CREATE FUNCTION public.record_api_usage(
  p_user_id UUID,
  p_token_id TEXT,
  p_tier TEXT,
  p_reads INTEGER,
  p_writes INTEGER,
  p_throttled INTEGER,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_agent TEXT := NULL;
BEGIN
  IF p_user_id IS NULL OR p_token_id IS NULL OR btrim(p_token_id) = '' THEN
    RAISE EXCEPTION 'p_user_id and p_token_id are required';
  END IF;

  IF p_user_agent IS NOT NULL AND btrim(p_user_agent) <> '' THEN
    v_user_agent := substr(btrim(p_user_agent), 1, 200);
  END IF;

  INSERT INTO public.api_usage_daily (
    user_id,
    token_id,
    day,
    tier,
    reads,
    writes,
    throttled,
    user_agent
  )
  VALUES (
    p_user_id,
    p_token_id,
    (NOW() AT TIME ZONE 'utc')::date,
    COALESCE(NULLIF(btrim(p_tier), ''), 'free'),
    GREATEST(COALESCE(p_reads, 0), 0),
    GREATEST(COALESCE(p_writes, 0), 0),
    GREATEST(COALESCE(p_throttled, 0), 0),
    v_user_agent
  )
  ON CONFLICT (user_id, token_id, day) DO UPDATE SET
    tier = EXCLUDED.tier,
    reads = public.api_usage_daily.reads + EXCLUDED.reads,
    writes = public.api_usage_daily.writes + EXCLUDED.writes,
    throttled = public.api_usage_daily.throttled + EXCLUDED.throttled,
    user_agent = COALESCE(EXCLUDED.user_agent, public.api_usage_daily.user_agent),
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.record_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  TO service_role;

DROP FUNCTION public.get_api_usage_summary(DATE, INTEGER);

CREATE FUNCTION public.get_api_usage_summary(
  p_since DATE,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  token_id TEXT,
  tier TEXT,
  reads BIGINT,
  writes BIGINT,
  throttled BIGINT,
  user_agent TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.user_id,
    u.token_id,
    (ARRAY_AGG(u.tier ORDER BY u.day DESC))[1] AS tier,
    COALESCE(SUM(u.reads), 0)::BIGINT AS reads,
    COALESCE(SUM(u.writes), 0)::BIGINT AS writes,
    COALESCE(SUM(u.throttled), 0)::BIGINT AS throttled,
    (
      ARRAY_AGG(u.user_agent ORDER BY u.day DESC, u.updated_at DESC)
        FILTER (WHERE u.user_agent IS NOT NULL)
    )[1] AS user_agent
  FROM public.api_usage_daily u
  WHERE u.day >= p_since
  GROUP BY u.user_id, u.token_id
  ORDER BY COALESCE(SUM(u.reads), 0) + COALESCE(SUM(u.writes), 0) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
$$;

REVOKE ALL ON FUNCTION public.get_api_usage_summary(DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_summary(DATE, INTEGER)
  TO service_role;
