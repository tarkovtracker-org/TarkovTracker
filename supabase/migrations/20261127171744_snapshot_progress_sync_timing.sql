SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;

CREATE TABLE private.progress_sync_timing_snapshots (
  captured_hour timestamptz NOT NULL,
  query_id bigint NOT NULL,
  captured_at timestamptz NOT NULL,
  stats_since timestamptz NOT NULL,
  stats_reset timestamptz,
  calls bigint NOT NULL,
  total_exec_time_ms double precision NOT NULL,
  PRIMARY KEY (captured_hour, query_id)
);

ALTER TABLE private.progress_sync_timing_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.progress_sync_timing_snapshots FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.snapshot_progress_sync_timing()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO private.progress_sync_timing_snapshots (
    captured_hour, query_id, captured_at, stats_since, stats_reset, calls, total_exec_time_ms
  )
  SELECT
    date_trunc('hour', statement_timestamp(), 'UTC'),
    stats.queryid,
    statement_timestamp(),
    stats.stats_since,
    info.stats_reset,
    stats.calls,
    stats.total_exec_time
  FROM extensions.pg_stat_statements AS stats
  CROSS JOIN extensions.pg_stat_statements_info AS info
  WHERE stats.dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
    AND stats.userid = 'authenticated'::regrole
    AND stats.toplevel
    -- Match the PostgREST statement shape so a new Postgres query ID can be recorded.
    AND starts_with(stats.query, 'WITH pgrst_source AS (')
    AND strpos(stats.query, '"public"."sync_user_game_mode_progress"(') > 0
  ON CONFLICT (captured_hour, query_id) DO NOTHING;

  DELETE FROM private.progress_sync_timing_snapshots
  WHERE captured_hour <= date_trunc('hour', statement_timestamp(), 'UTC') - INTERVAL '720 hours';
$$;

REVOKE ALL ON FUNCTION private.snapshot_progress_sync_timing() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.schedule(
  'snapshot-progress-sync-timing',
  '7 * * * *',
  $$SET statement_timeout = '5s'; SET lock_timeout = '1s'; SELECT private.snapshot_progress_sync_timing()$$
);
