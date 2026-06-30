-- Address Supabase advisor lints:
-- - 0011 function_search_path_mutable: pin search_path on the jsonb sanitizer/
--   merge helpers so lookups can't be hijacked via a role-mutable search_path.
-- - 0028/0029 *_security_definer_function_executable: these SECURITY DEFINER
--   functions are only ever invoked by the service role (api-gateway worker,
--   account-delete edge function) or fired as triggers. Revoke EXECUTE from
--   PUBLIC/anon/authenticated so they can't be called directly via PostgREST.
--
-- Some functions (e.g. handle_new_user) exist only on the hosted project and
-- are not created by migrations, so every change is guarded by to_regprocedure
-- and skipped when the target function is absent. This keeps `supabase db reset`
-- working locally while still hardening the remote database.

DO $$
DECLARE
  fn text;
  pin_path text[] := ARRAY[
    'public.merge_api_update_history(jsonb, jsonb, integer)',
    'public.sanitize_user_progress_api_task_updates(jsonb)',
    'public.sanitize_user_progress_api_update_meta(jsonb)',
    'public.sanitize_user_progress_api_update_history(jsonb)',
    'public.sanitize_user_progress_mode_data(jsonb)'
  ];
  -- Functions whose EXECUTE must be locked to the service role only.
  service_only text[] := ARRAY[
    'public.increment_token_usage(uuid)',
    'public.update_task_completion(uuid, text, text, boolean, boolean, bigint)',
    'public.transfer_team_ownership(uuid, uuid, uuid)'
  ];
  -- Trigger / internal functions: revoke direct EXECUTE, no service_role grant.
  -- Triggers still fire because they run as the table owner, not the caller.
  revoke_only text[] := ARRAY[
    'public.handle_new_user()',
    'public.prevent_user_system_admin_mutation()'
  ];
BEGIN
  FOREACH fn IN ARRAY pin_path LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY service_only LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY revoke_only LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;
