BEGIN;
SELECT no_plan();
SELECT set_config('request.headers', '{}', true);
INSERT INTO auth.users(id, email) SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'stripe-one-time-' || n || '@example.invalid' FROM generate_series(801, 809) AS n;
CREATE FUNCTION pg_temp.fulfill(p_id text, p_user integer DEFAULT 801, p_amount integer DEFAULT 400,
  p_paid timestamptz DEFAULT '2026-10-07 00:00:00+00', p_extra jsonb DEFAULT '{}')
RETURNS public.supporters LANGUAGE sql AS $$
  SELECT public.fulfill_one_time_supporter(p_id, p_paid,
    jsonb_build_object('user_id', ('00000000-0000-0000-0000-' || lpad(p_user::text, 12, '0')),
      'tier', 'scav', 'amount_total', p_amount) || p_extra);
$$;
SELECT ok(NOT has_function_privilege('anon', 'public.fulfill_one_time_supporter(text,timestamptz,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.fulfill_one_time_supporter(text,timestamptz,jsonb)', 'EXECUTE'),
  'browser roles cannot fulfill payments');
SELECT ok(has_function_privilege('service_role', 'public.fulfill_one_time_supporter(text,timestamptz,jsonb)', 'EXECUTE'),
  'service role may fulfill payments');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid =
  'public.fulfill_one_time_supporter(text,timestamptz,jsonb)'::regprocedure), 'fulfillment keeps caller privileges');
SELECT ok(NOT has_function_privilege('authenticated', 'private.assert_one_time_stripe_event_claim()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.assert_one_time_stripe_event_claim()', 'EXECUTE'),
  'private fencing wrapper is restricted');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'private.stripe_one_time_payments'::regclass),
  'payment ledger has RLS enabled');
SELECT ok(NOT has_table_privilege('anon', 'private.stripe_one_time_payments', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'private.stripe_one_time_payments', 'INSERT'),
  'browser roles cannot read or insert receipts');
SELECT ok(has_table_privilege('service_role', 'private.stripe_one_time_payments', 'SELECT,INSERT'),
  'invoker has explicit receipt permissions');
SET LOCAL ROLE service_role;
SELECT is((pg_temp.fulfill('pi_first')).expires_at, now() + interval '30 days',
  'cutoff boundary grants thirty days from fulfillment');
SELECT is((pg_temp.fulfill('pi_second')).expires_at, now() + interval '60 days',
  'distinct payments with the same timestamp stack');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.stripe_one_time_payments WHERE user_id =
  '00000000-0000-0000-0000-000000000801'), 2, 'each stable payment id has a receipt');
SELECT is((pg_temp.fulfill('pi_first')).expires_at, now() + interval '60 days',
  'older payment replay returns current expiry');
SELECT is((SELECT amount_total FROM public.supporters WHERE user_id =
  '00000000-0000-0000-0000-000000000801'), 400, 'amount remains the latest payment amount');
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_first', 802)$$, 'P0001',
  'Stripe payment belongs to another supporter', 'receipt cannot be reassigned to another user');
SELECT is((pg_temp.fulfill('pi_later', 801, 800, '2026-10-07 00:00:01+00')).expires_at,
  now() + interval '120 days', 'two periods stack on existing expiry');
SELECT is((pg_temp.fulfill('pi_earlier', 801, 400)).last_contribution_at,
  '2026-10-07 00:00:01+00'::timestamptz, 'out-of-order contribution evidence stays monotonic');
SELECT is((pg_temp.fulfill('pi_minimum', 802, 1)).expires_at,
  now() + interval '30 days', 'positive contributions below four dollars receive minimum period');
SELECT is((pg_temp.fulfill('pi_floor', 803, 1199)).expires_at,
  now() + interval '60 days', 'fractional periods round down');
SELECT is((pg_temp.fulfill('pi_cap', 804, 100000)).expires_at,
  now() + interval '360 days', 'individual donation is capped at twelve periods');
SELECT is((pg_temp.fulfill('pi_grandfather', 805, 400, '2026-10-06 23:59:59+00')).expires_at,
  NULL::timestamptz, 'successful payment before cutoff is grandfathered');
SELECT is((pg_temp.fulfill('pi_keep_grandfather', 805)).expires_at, NULL::timestamptz,
  'active one-time null expiry keeps grandfathered access');
UPDATE public.supporters SET status = 'expired', expires_at = now() - interval '10 days'
  WHERE user_id = '00000000-0000-0000-0000-000000000802';
SELECT is((pg_temp.fulfill('pi_restart', 802)).expires_at, now() + interval '30 days',
  'expired access restarts at current time');
INSERT INTO public.supporters(user_id, tier, status, type, stripe_subscription_id, stripe_customer_id,
  expires_at, started_at) VALUES ('00000000-0000-0000-0000-000000000806', 'timmy', 'past_due',
  'subscription', 'sub_live', 'cus_live', now() + interval '7 days', now() - interval '50 days');
SELECT is((pg_temp.fulfill('pi_live_upgrade', 806, 400, '2026-10-07 00:00:00+00',
  '{"tier":"chad","status":"active","type":"one_time","stripe_subscription_id":null,"expires_at":null}')).tier,
  'chad', 'one-time donation may upgrade a live subscription tier');
SELECT ok((SELECT status = 'past_due' AND type = 'subscription' AND stripe_subscription_id = 'sub_live'
  AND stripe_customer_id = 'cus_live' AND expires_at = now() + interval '7 days'
  AND started_at = now() - interval '50 days' FROM public.supporters WHERE user_id =
  '00000000-0000-0000-0000-000000000806'), 'live subscription and original start override stale record');
SELECT is((pg_temp.fulfill('pi_live_no_downgrade', 806)).tier, 'chad', 'donation cannot downgrade live subscription');
INSERT INTO public.supporters(user_id, tier, status, type, expires_at) VALUES
  ('00000000-0000-0000-0000-000000000808', 'chad', 'active', 'one_time', now() + interval '10 days'),
  ('00000000-0000-0000-0000-000000000809', 'chad', 'active', 'one_time', NULL);
SELECT is((pg_temp.fulfill('pi_keep_active_tier', 808)).tier, 'chad',
  'lower donation preserves already purchased active one-time tier');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id =
  '00000000-0000-0000-0000-000000000808'), now() + interval '40 days',
  'higher-tier preservation still stacks purchased time');
SELECT is((pg_temp.fulfill('pi_keep_lifetime_tier', 809)).tier, 'chad',
  'lower donation preserves grandfathered one-time tier');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id =
  '00000000-0000-0000-0000-000000000809'), NULL::timestamptz,
  'higher-tier preservation keeps grandfathered access');
UPDATE public.supporters SET expires_at = now() - interval '1 day'
  WHERE user_id = '00000000-0000-0000-0000-000000000808';
SELECT is((pg_temp.fulfill('pi_fresh_tier', 808)).tier, 'scav',
  'lapsed one-time access restarts at the newly purchased tier');
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_write_failure', 801, 400, '2026-10-07 00:00:00+00',
  '{"stripe_customer_id":"cus_live"}')$$, '23505', NULL, 'supporter write failure propagates');
SELECT is((SELECT count(*)::integer FROM private.stripe_one_time_payments WHERE payment_id = 'pi_write_failure'),
  0, 'supporter write failure rolls back payment receipt');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id = '00000000-0000-0000-0000-000000000801'),
  now() + interval '150 days', 'failed write leaves entitlement unchanged');
SELECT is((pg_temp.fulfill('pi_write_failure', 801)).expires_at, now() + interval '180 days',
  'retry after failed transaction can apply payment');
UPDATE public.supporters SET status = 'cancelled', has_ever_supported = false, expires_at = now() - interval '1 day'
  WHERE user_id = '00000000-0000-0000-0000-000000000801';
CREATE TEMP TABLE cancelled_snapshot AS SELECT to_jsonb(s) AS value FROM public.supporters s
  WHERE user_id = '00000000-0000-0000-0000-000000000801';
CREATE TEMP TABLE replay_write_counter (writes integer);
INSERT INTO replay_write_counter VALUES (0);
CREATE FUNCTION pg_temp.count_replay_writes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE replay_write_counter SET writes = writes + 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER count_replay_writes AFTER UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION pg_temp.count_replay_writes();
SELECT is(to_jsonb(pg_temp.fulfill('pi_first')), (SELECT value FROM cancelled_snapshot),
  'replay returns cancelled refunded row without any updates');
SELECT is((SELECT writes FROM replay_write_counter), 0, 'payment replay issues no supporter UPDATE');
DROP TRIGGER count_replay_writes ON public.supporters;
SELECT is((SELECT count(*)::integer FROM private.stripe_one_time_payments WHERE user_id =
  '00000000-0000-0000-0000-000000000801'), 5, 'replays never create another receipt');
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_zero', 807, 0)$$, 'P0001',
  'Invalid one-time supporter payment', 'zero contribution cannot create perks');
SELECT throws_ok($$SELECT pg_temp.fulfill('cs_not_a_payment', 807)$$, 'P0001',
  'Invalid one-time supporter payment', 'receipt requires stable payment intent identity');
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_missing_paid', 807, 400, NULL)$$, 'P0001',
  'Invalid one-time supporter payment', 'successful payment time is mandatory');
CREATE TEMP TABLE fulfillment_claim AS SELECT public.claim_stripe_event('evt_one_time_claim', 'test') AS claim;
SELECT set_config('request.headers', jsonb_build_object('x-supporter-credit-version', '1', 'x-stripe-event-id', 'evt_one_time_claim',
  'x-stripe-claim-token', claim->>'token')::text, true) FROM fulfillment_claim;
SELECT set_config('stripe.one_time_payment_id', '', true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.supporters(user_id, tier, status, type, expires_at)
  VALUES ('00000000-0000-0000-0000-000000000807', 'scav', 'active', 'one_time', now() + interval '30 days')$$,
  '40001', 'Timed one-time grants must use payment-identity fulfillment',
  'in-flight legacy handler cannot apply a timed grant after the cutover');
SELECT lives_ok($$SELECT pg_temp.fulfill('pi_current_claim', 807)$$, 'service-role RPC fences and accepts current claim');
RESET ROLE;
UPDATE public.stripe_events SET lease_expires_at = clock_timestamp() - interval '1 second'
  WHERE event_id = 'evt_one_time_claim';
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_expired_claim', 807)$$, '40001',
  'Stripe event claim is no longer current', 'expired claim fails at entry');
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_current_claim', 807)$$, '40001',
  'Stripe event claim is no longer current', 'even read-only payment replay validates claim');
RESET ROLE;
SELECT set_config('request.headers', '{}', true);
SELECT is((SELECT count(*)::integer FROM private.stripe_one_time_payments WHERE payment_id = 'pi_expired_claim'),
  0, 'expired claim leaves no receipt');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.fulfill('pi_browser', 808)$$, '42501', NULL, 'browser cannot invoke fulfillment');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
