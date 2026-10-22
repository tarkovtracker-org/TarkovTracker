BEGIN;
SELECT plan(30);

-- Mirrors Supabase advisor lints 0028/0029 over the PostgREST-exposed schemas.
SELECT is(
  (
    SELECT string_agg(p.oid::regprocedure::TEXT, ', ' ORDER BY p.oid::regprocedure::TEXT)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'graphql_public')
      AND p.prosecdef
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  ),
  NULL,
  'no exposed SECURITY DEFINER function is executable by client roles'
);

CREATE TEMP TABLE client_definer_rpc (identity TEXT, args TEXT, result TEXT, volatility "char");
INSERT INTO client_definer_rpc VALUES
  ('add_game_profile(text, text)', 'p_label text, p_eft_account_id text', 'jsonb', 'v'),
  ('archive_prestige_run_and_reset_progress(text, integer, integer, jsonb, jsonb, timestamptz, '
    || 'text, integer, bigint, jsonb, jsonb)',
    'p_mode text, p_prestige_from integer, p_prestige_to integer, p_archived_progress jsonb, '
    || 'p_summary jsonb, p_created_at timestamp with time zone, p_current_game_mode text, '
    || 'p_game_edition integer, p_tarkov_uid bigint, p_pvp_data jsonb, '
    || 'p_pve_data jsonb DEFAULT ''{}''::jsonb',
    'void', 'v'),
  ('delete_game_profile(uuid)', 'p_profile_id uuid', 'void', 'v'),
  ('get_game_profile_progress(uuid)', 'p_profile_id uuid', 'jsonb', 's'),
  ('list_game_profiles()', '', 'jsonb', 's'),
  ('set_game_mode_profile_visibility(text, smallint, boolean)',
    'p_game_mode text, p_season_number smallint, p_profile_public boolean', 'void', 'v'),
  ('sync_game_profile_progress(uuid, integer, jsonb, smallint)',
    'p_profile_id uuid, p_game_edition integer, p_modes jsonb, '
    || 'p_seasonal_season_number smallint DEFAULT NULL::smallint',
    'jsonb', 'v'),
  ('sync_user_game_mode_progress(text, integer, bigint, jsonb, smallint)',
    'p_current_game_mode text, p_game_edition integer, p_tarkov_uid bigint, p_modes jsonb, '
    || 'p_seasonal_season_number smallint DEFAULT NULL::smallint',
    'jsonb', 'v'),
  ('update_game_profile(uuid, text, text)', 'p_profile_id uuid, p_label text, p_eft_account_id text',
    'jsonb', 'v');

-- PostgREST resolves RPCs by argument name and picks GET/POST by volatility.
SELECT is(
  COALESCE((
    SELECT ROW(pg_get_function_arguments(w.oid), pg_get_function_result(w.oid), w.provolatile,
      w.prosecdef, w.proconfig, pg_get_function_arguments(b.oid), pg_get_function_result(b.oid),
      b.provolatile, b.prosecdef, b.proconfig)::TEXT
    FROM pg_proc w, pg_proc b
    WHERE w.oid = to_regprocedure('public.' || identity)
      AND b.oid = to_regprocedure('private.' || identity)
  ), 'missing'),
  ROW(args, result, volatility, false, ARRAY['search_path=""'],
    args, result, volatility, true, ARRAY['search_path=""'])::TEXT,
  identity || ' keeps its RPC contract through an invoker wrapper over a private definer'
)
FROM client_definer_rpc;

SELECT is(
  ROW(
    has_function_privilege('authenticated', to_regprocedure('public.' || identity), 'EXECUTE'),
    has_function_privilege('service_role', to_regprocedure('public.' || identity), 'EXECUTE'),
    has_function_privilege('anon', to_regprocedure('public.' || identity), 'EXECUTE')
  )::TEXT,
  ROW(true, true, false)::TEXT,
  'public.' || identity || ' is executable by authenticated and service_role only'
)
FROM client_definer_rpc;

SELECT is(
  (
    SELECT ROW(
      has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      has_function_privilege('service_role', p.oid, 'EXECUTE'),
      has_function_privilege('anon', p.oid, 'EXECUTE'),
      EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
    )::TEXT
    FROM pg_proc p WHERE p.oid = to_regprocedure('private.' || identity)
  ),
  ROW(true, true, false, false)::TEXT,
  'private.' || identity || ' is executable by authenticated and service_role, not anon or PUBLIC'
)
FROM client_definer_rpc;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000002901', 'definer-wrapper@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002901', true);

SET LOCAL ROLE authenticated;
SELECT is(public.list_game_profiles()->'profiles', '[]'::jsonb,
  'authenticated callers reach the private definer through the public wrapper');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.list_game_profiles()$$, '42501', NULL,
  'anon cannot call the public wrapper');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
