-- Client-callable SECURITY DEFINER bodies move out of the exposed API schema.
-- SET SCHEMA keeps each body, owner, search_path and ACL; public keeps the same
-- RPC names, argument names, defaults and volatility through SECURITY INVOKER
-- wrappers, so PostgREST callers are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER FUNCTION public.add_game_profile(text, text) SET SCHEMA private;
ALTER FUNCTION public.archive_prestige_run_and_reset_progress(
  text, integer, integer, jsonb, jsonb, timestamptz, text, integer, bigint, jsonb, jsonb
) SET SCHEMA private;
ALTER FUNCTION public.delete_game_profile(uuid) SET SCHEMA private;
ALTER FUNCTION public.get_game_profile_progress(uuid) SET SCHEMA private;
ALTER FUNCTION public.list_game_profiles() SET SCHEMA private;
ALTER FUNCTION public.set_game_mode_profile_visibility(text, smallint, boolean) SET SCHEMA private;
ALTER FUNCTION public.sync_game_profile_progress(uuid, integer, jsonb, smallint) SET SCHEMA private;
ALTER FUNCTION public.sync_user_game_mode_progress(text, integer, bigint, jsonb, smallint)
  SET SCHEMA private;
ALTER FUNCTION public.update_game_profile(uuid, text, text) SET SCHEMA private;

CREATE FUNCTION public.add_game_profile(p_label text, p_eft_account_id text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.add_game_profile(p_label, p_eft_account_id) $$;

CREATE FUNCTION public.archive_prestige_run_and_reset_progress(
  p_mode text,
  p_prestige_from integer,
  p_prestige_to integer,
  p_archived_progress jsonb,
  p_summary jsonb,
  p_created_at timestamptz,
  p_current_game_mode text,
  p_game_edition integer,
  p_tarkov_uid bigint,
  p_pvp_data jsonb,
  p_pve_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.archive_prestige_run_and_reset_progress(
    p_mode, p_prestige_from, p_prestige_to, p_archived_progress, p_summary, p_created_at,
    p_current_game_mode, p_game_edition, p_tarkov_uid, p_pvp_data, p_pve_data
  )
$$;

CREATE FUNCTION public.delete_game_profile(p_profile_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.delete_game_profile(p_profile_id) $$;

CREATE FUNCTION public.get_game_profile_progress(p_profile_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.get_game_profile_progress(p_profile_id) $$;

CREATE FUNCTION public.list_game_profiles()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.list_game_profiles() $$;

CREATE FUNCTION public.set_game_mode_profile_visibility(
  p_game_mode text,
  p_season_number smallint,
  p_profile_public boolean
)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.set_game_mode_profile_visibility(p_game_mode, p_season_number, p_profile_public) $$;

CREATE FUNCTION public.sync_game_profile_progress(
  p_profile_id uuid,
  p_game_edition integer,
  p_modes jsonb,
  p_seasonal_season_number smallint DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.sync_game_profile_progress(
    p_profile_id, p_game_edition, p_modes, p_seasonal_season_number
  )
$$;

CREATE FUNCTION public.sync_user_game_mode_progress(
  p_current_game_mode text,
  p_game_edition integer,
  p_tarkov_uid bigint,
  p_modes jsonb,
  p_seasonal_season_number smallint DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.sync_user_game_mode_progress(
    p_current_game_mode, p_game_edition, p_tarkov_uid, p_modes, p_seasonal_season_number
  )
$$;

CREATE FUNCTION public.update_game_profile(p_profile_id uuid, p_label text, p_eft_account_id text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.update_game_profile(p_profile_id, p_label, p_eft_account_id) $$;

REVOKE ALL ON FUNCTION
  public.add_game_profile(text, text),
  public.archive_prestige_run_and_reset_progress(
    text, integer, integer, jsonb, jsonb, timestamptz, text, integer, bigint, jsonb, jsonb
  ),
  public.delete_game_profile(uuid),
  public.get_game_profile_progress(uuid),
  public.list_game_profiles(),
  public.set_game_mode_profile_visibility(text, smallint, boolean),
  public.sync_game_profile_progress(uuid, integer, jsonb, smallint),
  public.sync_user_game_mode_progress(text, integer, bigint, jsonb, smallint),
  public.update_game_profile(uuid, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.add_game_profile(text, text),
  public.archive_prestige_run_and_reset_progress(
    text, integer, integer, jsonb, jsonb, timestamptz, text, integer, bigint, jsonb, jsonb
  ),
  public.delete_game_profile(uuid),
  public.get_game_profile_progress(uuid),
  public.list_game_profiles(),
  public.set_game_mode_profile_visibility(text, smallint, boolean),
  public.sync_game_profile_progress(uuid, integer, jsonb, smallint),
  public.sync_user_game_mode_progress(text, integer, bigint, jsonb, smallint),
  public.update_game_profile(uuid, text, text)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  private.add_game_profile(text, text),
  private.archive_prestige_run_and_reset_progress(
    text, integer, integer, jsonb, jsonb, timestamptz, text, integer, bigint, jsonb, jsonb
  ),
  private.delete_game_profile(uuid),
  private.get_game_profile_progress(uuid),
  private.list_game_profiles(),
  private.set_game_mode_profile_visibility(text, smallint, boolean),
  private.sync_game_profile_progress(uuid, integer, jsonb, smallint),
  private.sync_user_game_mode_progress(text, integer, bigint, jsonb, smallint),
  private.update_game_profile(uuid, text, text)
TO authenticated, service_role;

COMMIT;
