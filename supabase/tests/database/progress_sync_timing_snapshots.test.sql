BEGIN;
SELECT plan(8);

SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'snapshot-progress-sync-timing' AND active),
  '7 * * * *',
  'the timing job is active and runs hourly'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'private.progress_sync_timing_snapshots'::regclass)
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS roles(role_name)
    WHERE has_table_privilege(role_name, 'private.progress_sync_timing_snapshots',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR has_function_privilege(role_name, 'private.snapshot_progress_sync_timing()', 'EXECUTE')
  ),
  'application roles cannot read snapshots or run the collector'
);

INSERT INTO auth.users(id, email)
VALUES ('00000000-0000-0000-0000-000000001593', 'sync-timing@example.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001593', true);
WITH pgrst_source AS (
  SELECT "public"."sync_user_game_mode_progress"('pvp', 1, NULL, '{}'::jsonb, NULL)
)
SELECT * FROM pgrst_source;
WITH pgrst_source AS (SELECT auth.uid()) SELECT * FROM pgrst_source;
RESET ROLE;

DELETE FROM private.progress_sync_timing_snapshots;
INSERT INTO private.progress_sync_timing_snapshots
  (captured_hour, query_id, captured_at, stats_since, calls, total_exec_time_ms)
SELECT date_trunc('hour', now(), 'UTC') - age, -1593, now() - age, now() - age, 1, 1
FROM unnest(ARRAY[interval '719 hours', interval '720 hours']) AS ages(age);

SELECT private.snapshot_progress_sync_timing();

CREATE TEMP TABLE captured_progress_sync_test AS
SELECT * FROM private.progress_sync_timing_snapshots WHERE query_id <> -1593;

SELECT ok(
  EXISTS (SELECT 1 FROM captured_progress_sync_test WHERE calls > 0 AND total_exec_time_ms > 0),
  'an actual authenticated PostgREST-shaped sync produces a timing snapshot'
);
SELECT is_empty(
  $$SELECT captured.query_id
    FROM captured_progress_sync_test AS captured
    LEFT JOIN extensions.pg_stat_statements AS stats
      ON stats.queryid = captured.query_id AND stats.toplevel
      AND stats.userid = 'authenticated'::regrole
    WHERE stats.query IS NULL
       OR NOT starts_with(stats.query, 'WITH pgrst_source AS (')
       OR strpos(stats.query, '"public"."sync_user_game_mode_progress"(') = 0$$,
  'an unrelated PostgREST-shaped query is excluded'
);
SELECT is(
  (SELECT count(*) FROM private.progress_sync_timing_snapshots WHERE query_id = -1593),
  1::bigint,
  'the retention pass drops the expired hour and keeps the newer hour'
);
SELECT is(
  (SELECT captured_hour FROM private.progress_sync_timing_snapshots WHERE query_id = -1593),
  date_trunc('hour', now(), 'UTC') - INTERVAL '719 hours',
  'the retained hour is the newer hour'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM captured_progress_sync_test
    WHERE captured_hour <> date_trunc('hour', captured_at, 'UTC')
       OR stats_since > captured_at),
  'snapshots carry the UTC hour and the query-statistics epoch'
);

SELECT private.snapshot_progress_sync_timing();
SELECT results_eq(
  $$SELECT * FROM private.progress_sync_timing_snapshots WHERE query_id <> -1593 ORDER BY query_id$$,
  $$SELECT * FROM captured_progress_sync_test ORDER BY query_id$$,
  'a retry in the same hour does not overwrite the first snapshot'
);

SELECT * FROM finish();
ROLLBACK;
