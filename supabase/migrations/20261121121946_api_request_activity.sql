CREATE TABLE private.api_request_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Preserve the account's evidence after a token is revoked (the token row is deleted).
  token_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN (
    'GET /token', 'GET /progress', 'GET /team/progress', 'POST /progress/tasks',
    'POST /progress/level/{level}', 'POST /progress/task/{id}',
    'POST /progress/task/objective/{id}'
  )),
  client TEXT CHECK (client ~ '^[a-z][a-z0-9.-]{0,47}$'),
  status INTEGER NOT NULL CHECK (status BETWEEN 100 AND 599),
  kind TEXT NOT NULL CHECK (kind IN ('read', 'write')),
  outcome TEXT NOT NULL CHECK (outcome IN ('counted', 'throttled', 'unavailable')),
  quota_limit INTEGER,
  quota_remaining INTEGER,
  quota_reset_at TIMESTAMPTZ
);

CREATE INDEX api_request_activity_owner_time_idx
  ON private.api_request_activity (user_id, occurred_at DESC, id DESC);
CREATE INDEX api_request_activity_token_time_idx
  ON private.api_request_activity (user_id, token_id, occurred_at DESC, id DESC);
CREATE INDEX api_request_activity_retention_idx
  ON private.api_request_activity (occurred_at);

ALTER TABLE private.api_request_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.api_request_activity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.api_request_activity TO authenticated;
GRANT INSERT ON private.api_request_activity TO service_role;
CREATE POLICY api_request_activity_owner_read ON private.api_request_activity
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) AND occurred_at >= now() - INTERVAL '720 hours'
  );

CREATE FUNCTION public.record_api_request_activity(
  p_user_id UUID, p_token_id UUID, p_occurred_at TIMESTAMPTZ, p_endpoint TEXT,
  p_client TEXT, p_status INTEGER, p_kind TEXT, p_outcome TEXT,
  p_limit INTEGER, p_remaining INTEGER, p_reset_at_ms BIGINT
)
RETURNS VOID
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  INSERT INTO private.api_request_activity (
    user_id, token_id, occurred_at, endpoint, client, status, kind, outcome,
    quota_limit, quota_remaining, quota_reset_at
  )
  SELECT p_user_id, p_token_id, p_occurred_at, p_endpoint, p_client, p_status, p_kind, p_outcome,
    p_limit, p_remaining, to_timestamp(p_reset_at_ms / 1000.0)
  WHERE p_occurred_at BETWEEN now() - INTERVAL '720 hours' AND now() + INTERVAL '1 minute'
    AND EXISTS (
      SELECT 1 FROM public.api_tokens
      WHERE token_id = p_token_id AND user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.record_api_request_activity(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, INTEGER, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_api_request_activity(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, INTEGER, BIGINT
) TO service_role;

CREATE FUNCTION public.get_api_request_activity(
  p_range TEXT DEFAULT 'today',
  p_token_id UUID DEFAULT NULL,
  p_endpoint TEXT DEFAULT NULL,
  p_client TEXT DEFAULT NULL,
  p_before_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_throttle_only BOOLEAN DEFAULT FALSE,
  p_kind TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT
      CASE p_range
        WHEN '30d' THEN now() - INTERVAL '720 hours'
        WHEN '7d' THEN now() - INTERVAL '168 hours'
        WHEN '24h' THEN now() - INTERVAL '24 hours'
        ELSE date_trunc('day', now(), 'UTC')
      END AS starts_at,
      CASE WHEN p_range IN ('7d', '30d') THEN 'day' ELSE 'hour' END AS bucket,
      CASE WHEN p_range IN ('7d', '30d') THEN INTERVAL '1 day' ELSE INTERVAL '1 hour' END AS step
  ), scoped AS MATERIALIZED (
    SELECT a.occurred_at, a.endpoint, coalesce(a.client, '') AS client, a.outcome
    FROM private.api_request_activity a CROSS JOIN bounds b
    WHERE a.user_id = (SELECT auth.uid()) AND a.occurred_at BETWEEN b.starts_at AND now()
      AND p_before_at IS NULL
      AND (p_token_id IS NULL OR a.token_id = p_token_id)
      AND (p_kind IS NULL OR a.kind = p_kind)
  ), filtered AS MATERIALIZED (
    SELECT * FROM scoped
    WHERE (p_endpoint IS NULL OR endpoint = p_endpoint)
      AND (p_client IS NULL OR client = p_client)
      AND (NOT p_throttle_only OR outcome = 'throttled')
  ), summary AS (
    SELECT count(*) AS requests, count(*) FILTER (WHERE outcome = 'counted') AS counted,
      count(*) FILTER (WHERE outcome = 'throttled') AS throttled
    FROM filtered
  ), buckets AS (
    SELECT date_trunc(b.bucket, f.occurred_at, 'UTC') AS at, count(*) AS requests,
      count(*) FILTER (WHERE outcome = 'counted') AS counted,
      count(*) FILTER (WHERE outcome = 'throttled') AS throttled
    FROM filtered f CROSS JOIN bounds b
    GROUP BY 1
  ), chart AS (
    SELECT slot.at, coalesce(v.requests, 0) AS requests, coalesce(v.counted, 0) AS counted,
      coalesce(v.throttled, 0) AS throttled
    FROM bounds b
    CROSS JOIN LATERAL generate_series(
      date_trunc(b.bucket, b.starts_at, 'UTC'), date_trunc(b.bucket, now(), 'UTC'), b.step,
      'UTC'
    ) AS slot(at)
    LEFT JOIN buckets v USING (at)
  ), endpoints AS (
    SELECT endpoint AS value, count(*) AS requests,
      count(*) FILTER (WHERE outcome = 'counted') AS counted,
      count(*) FILTER (WHERE outcome = 'throttled') AS throttled
    FROM scoped GROUP BY endpoint
    ORDER BY count(*) FILTER (WHERE outcome = CASE WHEN p_throttle_only THEN 'throttled' ELSE 'counted' END) DESC,
      requests DESC, endpoint
  ), clients AS (
    SELECT client AS value, count(*) AS requests,
      count(*) FILTER (WHERE outcome = 'counted') AS counted,
      count(*) FILTER (WHERE outcome = 'throttled') AS throttled
    FROM scoped GROUP BY client
    ORDER BY count(*) FILTER (WHERE outcome = CASE WHEN p_throttle_only THEN 'throttled' ELSE 'counted' END) DESC,
      requests DESC, client LIMIT 20
  ), request_page AS (
    SELECT a.id, a.occurred_at, a.endpoint, coalesce(a.client, '') AS client,
      a.status, a.kind, a.outcome, a.quota_limit, a.quota_remaining, a.quota_reset_at
    FROM private.api_request_activity a CROSS JOIN bounds b
    WHERE a.user_id = (SELECT auth.uid()) AND a.occurred_at BETWEEN b.starts_at AND now()
      AND (p_token_id IS NULL OR a.token_id = p_token_id)
      AND (p_kind IS NULL OR a.kind = p_kind)
      AND (p_endpoint IS NULL OR a.endpoint = p_endpoint)
      AND (p_client IS NULL OR coalesce(a.client, '') = p_client)
      AND (NOT p_throttle_only OR a.outcome = 'throttled')
      AND (p_before_at IS NULL OR (a.occurred_at, a.id) < (p_before_at, p_before_id))
    ORDER BY a.occurred_at DESC, a.id DESC LIMIT 51
  ), quota AS (
    SELECT DISTINCT ON (kind) kind, occurred_at AS at, quota_limit AS limit,
      quota_remaining AS remaining, quota_reset_at AS reset_at
    FROM private.api_request_activity
    WHERE user_id = (SELECT auth.uid()) AND quota_reset_at > now()
      AND occurred_at BETWEEN date_trunc('day', now(), 'UTC') AND now()
      AND quota_limit IS NOT NULL AND quota_remaining IS NOT NULL
    ORDER BY kind, occurred_at DESC, quota_remaining, id DESC
  )
  SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'buckets', (SELECT jsonb_agg(to_jsonb(chart) ORDER BY at) FROM chart),
    'endpoints', coalesce((SELECT jsonb_agg(to_jsonb(endpoints)) FROM endpoints), '[]'::jsonb),
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(clients)) FROM clients), '[]'::jsonb),
    'requests', coalesce((
      SELECT jsonb_agg(to_jsonb(request_page) ORDER BY occurred_at DESC, id DESC) FROM request_page
    ), '[]'::jsonb),
    'quota', coalesce((SELECT jsonb_agg(to_jsonb(quota)) FROM quota), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_api_request_activity(
  TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, BOOLEAN, TEXT
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_api_request_activity(
  TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, BOOLEAN, TEXT
) TO authenticated;

SELECT cron.schedule(
  'api-request-activity-cleanup', '45 * * * *',
  $$DELETE FROM private.api_request_activity WHERE occurred_at < now() - INTERVAL '720 hours'$$
);
