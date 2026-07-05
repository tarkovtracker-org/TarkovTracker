CREATE TABLE IF NOT EXISTS public.api_usage_daily (
  user_id UUID NOT NULL,
  token_id TEXT NOT NULL,
  day DATE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  reads INTEGER NOT NULL DEFAULT 0,
  writes INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, token_id, day)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_daily_day ON public.api_usage_daily(day);

ALTER TABLE public.api_usage_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_usage_daily FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.api_usage_daily TO service_role;

COMMENT ON TABLE public.api_usage_daily IS
  'Per user/token daily API gateway usage counters for quota observability.';

CREATE OR REPLACE FUNCTION public.record_api_usage(
  p_user_id UUID,
  p_token_id TEXT,
  p_tier TEXT,
  p_reads INTEGER,
  p_writes INTEGER,
  p_throttled INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_token_id IS NULL OR btrim(p_token_id) = '' THEN
    RAISE EXCEPTION 'p_user_id and p_token_id are required';
  END IF;

  INSERT INTO public.api_usage_daily (user_id, token_id, day, tier, reads, writes, throttled)
  VALUES (
    p_user_id,
    p_token_id,
    (NOW() AT TIME ZONE 'utc')::date,
    COALESCE(NULLIF(btrim(p_tier), ''), 'free'),
    GREATEST(COALESCE(p_reads, 0), 0),
    GREATEST(COALESCE(p_writes, 0), 0),
    GREATEST(COALESCE(p_throttled, 0), 0)
  )
  ON CONFLICT (user_id, token_id, day) DO UPDATE SET
    tier = EXCLUDED.tier,
    reads = public.api_usage_daily.reads + EXCLUDED.reads,
    writes = public.api_usage_daily.writes + EXCLUDED.writes,
    throttled = public.api_usage_daily.throttled + EXCLUDED.throttled,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.record_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER)
  TO service_role;
