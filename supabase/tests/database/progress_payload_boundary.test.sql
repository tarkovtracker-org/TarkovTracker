BEGIN;
SELECT plan(16);

-- Synthetic 24-character game IDs; catalog-sized progress plus generous headroom.
-- Full histories and confirmations remain within their existing sanitizer limits.
CREATE FUNCTION pg_temp.full_mode_payload() RETURNS jsonb LANGUAGE sql AS $$
WITH api AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', lpad(n::text, 36, '0'), 'source', 'api', 'at', 1792425600000::bigint + n,
    'taskCount', 750, 'tasks', (
      SELECT jsonb_agg(jsonb_build_object('id', lpad(to_hex(t), 24, '0'), 'state', 'uncompleted'))
      FROM generate_series(1, 20) t
    )) ORDER BY n DESC) AS history FROM generate_series(1, 50) n
), manual AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', lpad(n::text, 3, '0') || repeat('😀', 125),
    'timestamp', 1792425600000::bigint + n, 'type', 'task', 'action', 'uncomplete',
    'title', repeat('😀', 200), 'details', repeat('😀', 300)
  ) ORDER BY n DESC) AS history FROM generate_series(1, 50) n
)
SELECT jsonb_build_object(
  'level', 79, 'displayName', 'Boundary fixture', 'pmcFaction', 'USEC',
  'prestigeLevel', 0, 'progressEpoch', 0, 'manualActivityEpoch', 0,
  'taskCompletions', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('complete', true, 'failed', false, 'manual', true,
      'timestamp', 1792425600000::bigint)) FROM generate_series(1, 750) n),
  'taskObjectives', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('complete', true, 'count', 100, 'timestamp', 1792425600000::bigint))
    FROM generate_series(1, 2200) n),
  'taskAvailability', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('requirements', repeat('r', 238), 'timestamp', 1792425600000::bigint))
    FROM generate_series(1, 1000) n),
  'hideoutParts', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('complete', true, 'count', 50, 'timestamp', 1792425600000::bigint))
    FROM generate_series(1, 500) n),
  'hideoutModules', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('complete', true, 'timestamp', 1792425600000::bigint))
    FROM generate_series(1, 100) n),
  'traders', (SELECT jsonb_object_agg(lpad(to_hex(n), 24, '0'),
    jsonb_build_object('level', 4, 'reputation', 6)) FROM generate_series(1, 10) n),
  'skills', (SELECT jsonb_object_agg('skill-' || n, 51) FROM generate_series(1, 60) n),
  'skillOffsets', (SELECT jsonb_object_agg('skill-' || n, 1) FROM generate_series(1, 60) n),
  'storyChapters', (SELECT jsonb_object_agg('chapter-' || n, jsonb_build_object(
    'complete', true, 'objectives', (SELECT jsonb_object_agg('objective-' || t,
      jsonb_build_object('complete', true, 'timestamp', 1792425600000::bigint))
      FROM generate_series(1, 10) t))) FROM generate_series(1, 12) n),
  'apiUpdateHistory', api.history, 'lastApiUpdate', api.history->0,
  'manualActivityHistory', manual.history
) FROM api, manual;
$$;

CREATE TEMP TABLE payload_fixture AS SELECT public.sanitize_user_progress_mode_data(
  pg_temp.full_mode_payload()) AS mode;
GRANT SELECT ON payload_fixture TO authenticated;

SELECT ok(pg_column_size(jsonb_build_object('pvp', mode)) > 524288,
  'a populated supported mode still exceeds the historical 512 KiB JSONB guard') FROM payload_fixture;
SELECT ok(pg_column_size(jsonb_build_object('pvp', mode)) < 1048576,
  '1 MiB supports the stress fixture without dropping progress or histories') FROM payload_fixture;
SELECT is(jsonb_array_length(mode->'manualActivityHistory'), 50, 'all Unicode manual rows survive') FROM payload_fixture;
SELECT is(jsonb_array_length(mode->'apiUpdateHistory'), 50, 'all capped API history rows survive') FROM payload_fixture;
SELECT is((SELECT count(*)::int FROM jsonb_object_keys(mode->'taskAvailability')), 1000,
  'all budgeted confirmations survive') FROM payload_fixture;
SELECT diag(format('stress mode: JSONB=%s bytes, JSON text=%s bytes',
  pg_column_size(jsonb_build_object('pvp', mode)), octet_length(jsonb_build_object('pvp', mode)::text)))
FROM payload_fixture;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000009600', 'payload-boundary@example.invalid');
INSERT INTO public.supporters (user_id, type, status, expires_at) VALUES
  ('00000000-0000-0000-0000-000000009600', 'subscription', 'active', NULL);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009600', true);
CREATE TEMP TABLE payload_profile AS
  SELECT (public.add_game_profile('Boundary', '9600')->'profile'->>'id')::uuid AS id;
GRANT SELECT ON payload_profile TO authenticated;
SET LOCAL ROLE authenticated;

SELECT lives_ok($q$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  jsonb_build_object('pvp', mode), NULL) FROM payload_fixture$q$,
  'normal/repair RPC accepts the complete stress mode');
SELECT is((SELECT progress_data FROM public.user_game_mode_progress
  WHERE user_id = auth.uid() AND game_mode = 'pvp' AND season_number = 0),
  (SELECT mode FROM payload_fixture), 'default-profile save preserves the entire sanitized mode');
SELECT lives_ok($q$SELECT public.sync_game_profile_progress((SELECT id FROM payload_profile), 1,
  jsonb_build_object('pvp', mode), NULL) FROM payload_fixture$q$,
  'additional-profile RPC accepts the same complete mode');
SELECT is((SELECT value->'progress_data' FROM jsonb_array_elements(
  public.get_game_profile_progress((SELECT id FROM payload_profile))->'modes')
  WHERE value->>'game_mode' = 'pvp'),
  (SELECT mode FROM payload_fixture), 'additional-profile save preserves the entire mode');

-- Exact boundary generated from the in-memory JSONB value, never a TOAST-compressed row.
CREATE FUNCTION pg_temp.boundary_modes(target integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('pvp', jsonb_build_object('_padding',
    repeat('x', target - pg_column_size('{"pvp":{"_padding":""}}'::jsonb))));
$$;
SELECT is(pg_column_size(pg_temp.boundary_modes(1048576)), 1048576,
  'boundary fixture is exactly 1 MiB of incoming JSONB');
SELECT lives_ok($q$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  pg_temp.boundary_modes(1048576), NULL)$q$, 'default-profile guard accepts the exact boundary');
SELECT throws_ok($q$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  pg_temp.boundary_modes(1048577), NULL)$q$, 'P0001', 'p_modes exceeds the maximum payload size',
  'default-profile guard rejects one JSONB byte above the boundary');
SELECT lives_ok($q$SELECT public.sync_game_profile_progress((SELECT id FROM payload_profile), 1,
  pg_temp.boundary_modes(1048576), NULL)$q$, 'additional-profile guard accepts the exact boundary');
SELECT throws_ok($q$SELECT public.sync_game_profile_progress((SELECT id FROM payload_profile), 1,
  pg_temp.boundary_modes(1048577), NULL)$q$, 'P0001', 'p_modes exceeds the maximum payload size',
  'additional-profile guard rejects one JSONB byte above the boundary');
SELECT throws_ok($q$SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '[]', NULL)$q$,
  'P0001', 'p_modes must be a JSON object', 'malformed containers are still rejected');

SELECT throws_ok($q$SELECT public.sync_game_profile_progress((SELECT id FROM payload_profile), 1,
  '[]', NULL)$q$, 'P0001', 'p_modes must be a JSON object',
  'additional-profile malformed containers are still rejected');

SELECT * FROM finish();
ROLLBACK;
