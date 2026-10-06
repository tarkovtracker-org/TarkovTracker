BEGIN;
SELECT plan(26);
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-000000000702', 'stripe-recovery@example.invalid');
INSERT INTO public.supporters(user_id, tier, status, type)
  VALUES ('00000000-0000-0000-0000-000000000702', 'scav', 'active', 'one_time');
CREATE TEMP TABLE stripe_claims AS
  SELECT public.claim_stripe_event('evt_recovery', 'test') AS first_claim;
SELECT is(first_claim->>'outcome', 'claimed', 'first delivery claims work') FROM stripe_claims;
SELECT is(public.claim_stripe_event('evt_recovery', 'test')->>'outcome', 'in_progress',
  'in-progress duplicate is not completed');
SELECT is(public.claim_stripe_event('evt_recovery', 'other')->>'outcome', 'type_mismatch',
  'event type cannot change during retries');
SELECT is(public.finish_stripe_event('evt_recovery', gen_random_uuid(), 'completed'), false,
  'wrong token cannot complete work');
SELECT is(public.finish_stripe_event('evt_recovery', (first_claim->>'token')::uuid, 'retryable'), true,
  'transient failure is persisted without deleting receipt') FROM stripe_claims;
ALTER TABLE stripe_claims ADD COLUMN second_claim jsonb;
UPDATE stripe_claims SET second_claim = public.claim_stripe_event('evt_recovery', 'test');
SELECT isnt(second_claim->>'token', first_claim->>'token', 'retry replaces token') FROM stripe_claims;
SELECT is(public.finish_stripe_event('evt_recovery', (first_claim->>'token')::uuid, 'terminal'), false,
  'old worker cannot finish after replacement') FROM stripe_claims;
SELECT set_config('request.headers', jsonb_build_object('x-stripe-event-id', 'evt_recovery',
  'x-stripe-claim-token', first_claim->>'token')::text, true) FROM stripe_claims;
SELECT throws_ok($$UPDATE public.supporters SET tier = 'chad'$$, '40001',
  'Stripe event claim is no longer current', 'old worker cannot change entitlements');
SELECT throws_ok($$SELECT public.disqualify_supporter_customer('cus_stale', NULL)$$, '40001',
  'Stripe event claim is no longer current', 'nested disqualification is fenced before effects');
SELECT is((SELECT count(*)::integer FROM private.supporter_chargebacks WHERE customer_id = 'cus_stale'),
  0, 'rejected chargeback leaves no partial denial');
SELECT set_config('request.headers', jsonb_build_object('x-stripe-event-id', 'evt_recovery',
  'x-stripe-claim-token', second_claim->>'token')::text, true) FROM stripe_claims;
SELECT lives_ok($$UPDATE public.supporters SET tier = 'timmy'$$, 'current worker may update supporter');
SELECT lives_ok($$SELECT public.disqualify_supporter_customer('cus_current', NULL)$$,
  'current worker may use nested definer RPC');
UPDATE public.stripe_events SET lease_expires_at = clock_timestamp() - interval '1 second'
  WHERE event_id = 'evt_recovery';
SELECT throws_ok($$UPDATE public.supporters SET tier = 'chad'$$, '40001',
  'Stripe event claim is no longer current', 'slow worker cannot start a write after expiry');
SELECT is(public.finish_stripe_event('evt_recovery', (second_claim->>'token')::uuid, 'completed'), false,
  'slow worker cannot complete an expired claim') FROM stripe_claims;
ALTER TABLE stripe_claims ADD COLUMN third_claim jsonb;
UPDATE stripe_claims SET third_claim = public.claim_stripe_event('evt_recovery', 'test');
SELECT is(third_claim->>'outcome', 'claimed', 'crash or failed outcome update recovers after expiry') FROM stripe_claims;
SELECT is(public.finish_stripe_event('evt_recovery', (third_claim->>'token')::uuid, 'completed'), true,
  'replacement can durably complete') FROM stripe_claims;
SELECT is(public.claim_stripe_event('evt_recovery', 'test')->>'outcome', 'completed',
  'only durable completed receipt permits duplicate acknowledgement');
SELECT set_config('request.headers', '{"x-stripe-event-id":"evt_recovery"}', true);
SELECT throws_ok($$UPDATE public.supporters SET tier = 'chad'$$, '40001',
  'Stripe event claim is no longer current', 'missing token fails closed');
SELECT set_config('request.headers', '{"x-stripe-claim-token":"spoofed"}', true);
SELECT throws_ok($$UPDATE public.supporters SET tier = 'chad'$$, '40001',
  'Stripe event claim is no longer current', 'missing event id fails closed');
SELECT set_config('request.headers', '{}', true);
SELECT lives_ok($$UPDATE public.supporters SET tier = 'scav'$$,
  'legitimate existing billing writers without webhook headers retain behavior');
INSERT INTO public.stripe_events(event_id, event_type) VALUES ('evt_unknown', 'test');
SELECT is(public.claim_stripe_event('evt_unknown', 'test')->>'outcome', 'legacy_unknown',
  'old receipts are neither replayed nor declared completed');
SELECT is((SELECT attempts FROM public.stripe_events WHERE event_id = 'evt_unknown'), 0,
  'unknown receipt remains unclaimed');
SELECT ok(NOT has_function_privilege('anon', 'public.claim_stripe_event(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.finish_stripe_event(text,uuid,text)', 'EXECUTE'),
  'browser roles cannot claim or complete Stripe events');
SELECT ok(has_function_privilege('service_role', 'public.claim_stripe_event(text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.finish_stripe_event(text,uuid,text)', 'EXECUTE'),
  'only existing privileged webhook writer gains RPC execution');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$UPDATE public.supporters SET tier = 'chad'$$, '42501', NULL,
  'missing webhook headers do not bypass existing browser write grants');
RESET ROLE;
SELECT ok((SELECT command LIKE '%completed_at%' AND command LIKE '%completed%terminal%'
  FROM cron.job WHERE jobname = 'stripe-events-cleanup'), 'retention preserves unresolved receipts');
SELECT * FROM finish();
ROLLBACK;
