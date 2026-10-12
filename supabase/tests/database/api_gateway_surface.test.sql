BEGIN;
SELECT plan(21);

-- The public API Worker (tarkovtracker-org/TarkovTracker-API) calls these objects through
-- PostgREST with the service_role key. Its supabase-surface.json is the source list and its own
-- test keeps that list equal to the Worker source; keep this contract equal to the manifest at
-- the API commit pinned in workers/contract-tests/api-version.json. A migration that drops,
-- renames or revokes any of these breaks the deployed public API, which ships separately.
CREATE TEMP TABLE api_gateway_relation_contract (relation TEXT, columns TEXT[]);
INSERT INTO api_gateway_relation_contract VALUES
  ('api_tokens', ARRAY[
    'created_at', 'expires_at', 'game_mode', 'is_active', 'last_used_at', 'note',
    'permissions', 'token_hash', 'token_id', 'usage_count', 'user_id'
  ]),
  ('supporter_entitlements', ARRAY['expires_at', 'status', 'tier', 'user_id']),
  -- Read only while supporter_entitlements is missing; still required for that fallback.
  ('supporters', ARRAY['expires_at', 'status', 'tier', 'user_id']),
  ('team_memberships', ARRAY['game_mode', 'team_id', 'user_id']),
  ('user_game_mode_progress', ARRAY['game_mode', 'progress_data', 'season_number', 'user_id']),
  ('user_progress', ARRAY['game_edition', 'user_id']);

SELECT ok(
  to_regclass('public.' || relation) IS NOT NULL,
  'API gateway relation public.' || relation || ' exists'
)
FROM api_gateway_relation_contract;

SELECT is(
  ARRAY(
    SELECT column_name FROM unnest(columns) AS column_name
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.' || relation)
        AND a.attname = column_name AND a.attnum > 0 AND NOT a.attisdropped
        AND has_column_privilege('service_role', a.attrelid, a.attnum, 'SELECT')
    )
  ),
  ARRAY[]::TEXT[],
  'service_role can read every API gateway column of public.' || relation
)
FROM api_gateway_relation_contract;

-- The only direct table write: token usage stamps last_used_at with a filtered PATCH.
SELECT ok(
  has_column_privilege('service_role', 'public.api_tokens', 'last_used_at', 'UPDATE'),
  'service_role can update public.api_tokens.last_used_at'
);

-- PostgREST resolves RPCs by argument name, so names, types and order are all part of the API.
CREATE TEMP TABLE api_gateway_function_contract (
  signature TEXT, argument_names TEXT[], result_type TEXT
);
INSERT INTO api_gateway_function_contract VALUES
  ('public.get_active_season_number()', ARRAY[]::TEXT[], 'smallint'),
  ('public.increment_token_usage(uuid)', ARRAY['p_token_id'], 'void'),
  (
    'public.merge_progress_data(uuid, text, jsonb, jsonb, jsonb)',
    ARRAY['p_user_id', 'p_field', 'p_task_completions', 'p_task_objectives', 'p_set'],
    'integer'
  ),
  (
    'public.record_api_usage(uuid, text, text, integer, integer, integer, text)',
    ARRAY['p_user_id', 'p_token_id', 'p_tier', 'p_reads', 'p_writes', 'p_throttled',
      'p_user_agent'],
    'void'
  );

SELECT is(
  (
    SELECT ROW(
      COALESCE(p.proargnames, ARRAY[]::TEXT[]), format_type(p.prorettype, NULL), p.proretset
    )::TEXT
    FROM pg_proc p WHERE p.oid = to_regprocedure(signature)
  ),
  -- proretset = false: SETOF keeps prorettype but makes PostgREST return an array.
  ROW(argument_names, result_type, false)::TEXT,
  signature || ' keeps its API gateway argument names, result type and scalar return'
)
FROM api_gateway_function_contract;

SELECT ok(
  to_regprocedure(signature) IS NOT NULL
    AND has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'),
  'service_role can execute ' || signature
)
FROM api_gateway_function_contract;

SELECT * FROM finish();
ROLLBACK;
