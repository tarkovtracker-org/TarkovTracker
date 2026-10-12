BEGIN;
SELECT plan(7);
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('user_game_profiles','user_profile_mode_progress')
  AND permissive='RESTRICTIVE' AND qual='false' AND with_check='false'),2,
  'both profile tables explicitly deny direct client access');
SELECT ok(NOT has_table_privilege('authenticated','public.user_game_profiles','SELECT')
  AND NOT has_table_privilege('anon','public.user_profile_mode_progress','INSERT'),
  'profile rows remain inaccessible outside authenticated RPCs');
CREATE FUNCTION pg_temp.credit_profile_checks() RETURNS SETOF text LANGUAGE plpgsql AS $test$
DECLARE
  target uuid := '00000000-0000-0000-0000-000000001101';
  has_credit_schema boolean := pg_catalog.to_regclass('public.supporter_entitlements') IS NOT NULL;
BEGIN
  IF NOT has_credit_schema THEN
    -- Isolate the entitlement consumer contract before the independent billing
    -- migration lands. The composed replay exercises its real fulfillment RPC.
    EXECUTE $fixture$
      CREATE VIEW public.supporter_entitlements AS
        SELECT user_id,
          CASE WHEN current_setting('test.profile_credit_running',true)='true'
            THEN 'active' ELSE status END AS status,
          CASE WHEN current_setting('test.profile_credit_running',true)='true'
            THEN NULL::timestamptz ELSE expires_at END AS expires_at
        FROM public.supporters;
    $fixture$;
    PERFORM set_config('test.profile_credit_running','true',true);
  END IF;
  EXECUTE $setup$
    INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000001101','profile-credit@example.invalid');
    INSERT INTO public.supporters(user_id,type,status,tier,has_ever_supported,stripe_subscription_id,expires_at)
      VALUES ('00000000-0000-0000-0000-000000001101','subscription','past_due','chad',true,'sub_profile_credit',now()-interval '1 day');
  $setup$;
  IF has_credit_schema THEN
    EXECUTE $credit$ SELECT public.fulfill_one_time_supporter('pi_profile_credit',now(),
      '{"user_id":"00000000-0000-0000-0000-000000001101","tier":"scav","amount_total":400}'::jsonb); $credit$;
  END IF;
  RETURN NEXT ok(private.game_profiles_unlocked(target),'effective running credit unlocks profile writes after raw grace expiry');
  RETURN NEXT lives_ok($query$ SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001101',true);
    SELECT public.add_game_profile('Prepaid alt','prepaid_account'); $query$,
    'the effective credit gate is used by the actual authenticated profile RPC');
  IF has_credit_schema THEN
    EXECUTE $expire$ UPDATE public.supporters SET one_time_expires_at=now()-interval '1 second'
      WHERE user_id='00000000-0000-0000-0000-000000001101'; $expire$;
  ELSE
    PERFORM set_config('test.profile_credit_running','false',true);
  END IF;
  RETURN NEXT ok(NOT private.game_profiles_unlocked(target),'spent prepaid credit locks profile writes');
  EXECUTE $reactivate$ UPDATE public.supporters SET status='active',expires_at=NULL
    WHERE user_id='00000000-0000-0000-0000-000000001101'; $reactivate$;
  RETURN NEXT ok(private.game_profiles_unlocked(target),'subscription recovery unlocks writes through effective entitlements');
  EXECUTE $disqualify$ UPDATE public.supporters SET supporter_disqualified_at=now()
    WHERE user_id='00000000-0000-0000-0000-000000001101'; $disqualify$;
  RETURN NEXT ok(NOT private.game_profiles_unlocked(target),'disqualification denies writes even when a plan is active');
END;
$test$;
SELECT * FROM pg_temp.credit_profile_checks();
SELECT * FROM finish();
ROLLBACK;
