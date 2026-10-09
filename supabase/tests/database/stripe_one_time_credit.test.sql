BEGIN;
SELECT no_plan();
SELECT set_config('request.headers', '{}', true);
INSERT INTO auth.users(id,email) SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  'one-time-credit-' || n || '@example.invalid' FROM generate_series(901,931) n;
CREATE FUNCTION pg_temp.pay(p_user integer, p_id text, p_paid timestamptz DEFAULT '2026-10-07 00:00:00+00')
RETURNS public.supporters LANGUAGE sql AS $$
  SELECT public.fulfill_one_time_supporter(p_id,p_paid,jsonb_build_object('user_id',
    '00000000-0000-0000-0000-' || lpad(p_user::text,12,'0'),'tier','scav','amount_total',400));
$$;
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000901','subscription','active','chad','sub_credit_a');
SELECT pg_temp.pay(901,'pi_credit_during_subscription');
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is((SELECT type FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000901'),
  'one_time','donation during subscription resumes one-time access on end');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000901'),
  now()+interval '30 days','purchased period survives subscription end');
SELECT pg_temp.pay(902,'pi_credit_before_subscription');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_credit_b' WHERE user_id='00000000-0000-0000-0000-000000000902';
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000902';
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000902'),
  now()+interval '30 days','remaining time survives starting and ending subscription');
SELECT pg_temp.pay(903,'pi_credit_grandfathered','2026-10-06 23:59:59+00');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_credit_c' WHERE user_id='00000000-0000-0000-0000-000000000903';
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000903';
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000903'),
  NULL::timestamptz,'grandfathered access survives the subscription');
SELECT is((SELECT tier FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000901'),
  'scav','subscription tier is not transferred to lower one-time credit');
CREATE TEMP TABLE credit_snapshot AS SELECT to_jsonb(s) value FROM public.supporters s
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is(to_jsonb(pg_temp.pay(901,'pi_credit_during_subscription')), (SELECT value FROM credit_snapshot),
  'replay after subscription end leaves the complete current row unchanged');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_credit_second' WHERE user_id='00000000-0000-0000-0000-000000000902';
SELECT pg_temp.pay(902,'pi_credit_second_donation');
SELECT is((SELECT one_time_remaining FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000902'),
  interval '60 days','new donation stacks on independent credit while subscribed');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000902'),
  NULL::timestamptz,'live subscription keeps its effective expiry');
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
  WHERE user_id='00000000-0000-0000-0000-000000000902';
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000902'),
  now()+interval '60 days','ending subscription restores stacked credit');
UPDATE public.supporters SET expires_at=now()-interval '1 day'
  WHERE user_id='00000000-0000-0000-0000-000000000902';
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_credit_lapsed' WHERE user_id='00000000-0000-0000-0000-000000000902';
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
  WHERE user_id='00000000-0000-0000-0000-000000000902';
SELECT is((SELECT status FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000902'),
  'expired','previously exhausted credit does not resurrect access');
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
INSERT INTO public.supporters(user_id,type,status,tier,has_ever_supported,expires_at)
  VALUES ('00000000-0000-0000-0000-000000000904','one_time','active','chad',true,NULL);
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
UPDATE public.supporters SET type='subscription',status='active',tier='scav',stripe_subscription_id='sub_legacy'
  WHERE user_id='00000000-0000-0000-0000-000000000904';
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
  WHERE user_id='00000000-0000-0000-0000-000000000904';
SELECT ok((SELECT tier='chad' AND type='one_time' AND status='active' AND expires_at IS NULL
  FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000904'),
  'pre-migration grandfathered row is captured lazily before subscription replacement');
SELECT public.disqualify_supporter_customer('cus_credit_denial','00000000-0000-0000-0000-000000000904');
SELECT ok((SELECT one_time_tier IS NULL AND one_time_expires_at IS NULL AND NOT has_ever_supported
  FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000904'),
  'chargeback clears all independent credit');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_credit_refund' WHERE user_id='00000000-0000-0000-0000-000000000901';
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL,
  one_time_tier=NULL,one_time_expires_at=NULL,one_time_remaining=NULL
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is((SELECT status FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000901'),
  'expired','explicit payment revocation does not restore independent credit');
SELECT ok(NOT has_column_privilege('authenticated','public.supporters','one_time_tier','UPDATE'),
  'browser cannot change independent credit');
-- Paused days do not age with the original purchase calendar. Model a long
-- subscription by moving its start into the past, then deliver a delayed end.
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
  stripe_subscription_id='sub_delayed',started_at=now()-interval '120 days'
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT pg_temp.pay(901,'pi_credit_prepaid');
SELECT is((SELECT one_time_remaining FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000901'), interval '30 days',
  'donation is banked instead of having a calendar deadline');
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL,
  subscription_ended_at=now()-interval '2 days'
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is((SELECT expires_at FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000901'), now()+interval '28 days',
  'delayed cancellation resumes from actual end, not webhook arrival');
SELECT ok((SELECT one_time_remaining IS NULL FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000901'),
  'resumed credit is no longer paused');
UPDATE public.supporters SET expires_at=now()+interval '10 days 1 second'
  WHERE user_id='00000000-0000-0000-0000-000000000901';
UPDATE public.supporters SET type='subscription',status='active',expires_at=NULL,
  stripe_subscription_id='sub_fractional_pause'
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is((SELECT one_time_remaining FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000901'), interval '10 days 1 second',
  'subscription pauses only the exact unused duration');
UPDATE public.supporters SET status='past_due',expires_at=now()-interval '1 day'
  WHERE user_id='00000000-0000-0000-0000-000000000901';
SELECT is((SELECT expires_at FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000901'), now()+interval '9 days 1 second',
  'expired grace resumes credit from grace expiry, not a previous subscription end');
SELECT ok(NOT has_column_privilege('authenticated','public.supporters','one_time_remaining','UPDATE'),
  'browser cannot change prepaid balance');
CREATE TEMP TABLE credit_claim AS SELECT public.claim_stripe_event('evt_credit_rollout', 'test') AS claim;
SELECT set_config('request.headers', jsonb_build_object('x-stripe-event-id','evt_credit_rollout',
  'x-stripe-claim-token',claim->>'token')::text,true) FROM credit_claim;
SELECT throws_ok($$UPDATE public.supporters SET status='expired'
  WHERE user_id='00000000-0000-0000-0000-000000000901'$$, '40001',
  'Supporter credit requires updated webhook', 'old webhook retries before touching credit-bearing entitlement');
SELECT set_config('request.headers', jsonb_build_object('x-stripe-event-id','evt_credit_rollout',
  'x-stripe-claim-token',claim->>'token','x-supporter-credit-version','1')::text,true) FROM credit_claim;
SELECT lives_ok($$UPDATE public.supporters SET updated_at=now()
  WHERE user_id='00000000-0000-0000-0000-000000000901'$$,
  'updated claimed webhook can reconcile credit-bearing entitlement');
SELECT set_config('request.headers','{}',true);
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000905','subscription','active','chad','sub_refund_bank'),
  ('00000000-0000-0000-0000-000000000906','subscription','active','chad','sub_refund_first');
SELECT pg_temp.pay(905,'pi_bank_refunded');
SELECT pg_temp.pay(905,'pi_bank_kept');
SELECT public.refund_one_time_supporter('pi_bank_refunded','00000000-0000-0000-0000-000000000905',
  '2026-10-07 00:00:00+00',400);
SELECT ok((SELECT type='subscription' AND status='active' AND tier='chad' AND one_time_remaining=interval '30 days'
  FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000905'),
  'refund removes only its banked days and preserves both subscription and other payment');
SELECT public.refund_one_time_supporter('pi_bank_refunded','00000000-0000-0000-0000-000000000905',
  '2026-10-07 00:00:00+00',400);
SELECT is((SELECT one_time_remaining FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000905'),interval '30 days','refund replay subtracts no additional days');
SELECT public.refund_one_time_supporter('pi_refund_before_checkout','00000000-0000-0000-0000-000000000906',
  '2026-10-07 00:00:00+00',400);
SELECT pg_temp.pay(906,'pi_refund_before_checkout');
SELECT ok((SELECT one_time_tier IS NULL AND type='subscription' AND status='active'
  FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000906'),
  'refund before checkout permanently fences later fulfillment without revoking valid subscription');
SELECT pg_temp.pay(907,'pi_partly_used');
UPDATE public.supporters SET expires_at=now()+interval '10 days'
  WHERE user_id='00000000-0000-0000-0000-000000000907';
UPDATE public.supporters SET type='subscription',status='active',expires_at=NULL,stripe_subscription_id='sub_partial_bank'
  WHERE user_id='00000000-0000-0000-0000-000000000907';
SELECT pg_temp.pay(907,'pi_other_prepaid');
SELECT public.refund_one_time_supporter('pi_partly_used','00000000-0000-0000-0000-000000000907',
  '2026-10-07 00:00:00+00',400);
SELECT is((SELECT one_time_remaining FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000000907'),interval '30 days',
  'refund of partly consumed pre-subscription time preserves all of the other prepaid payment');
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id,expires_at,has_ever_supported)
VALUES ('00000000-0000-0000-0000-000000000908','subscription','past_due','chad','sub_no_more_events',
  now()+interval '1 day',true);
SELECT pg_temp.pay(908,'pi_after_grace');
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
UPDATE public.supporters SET expires_at=now()-interval '1 day'
  WHERE user_id='00000000-0000-0000-0000-000000000908';
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
CREATE TEMP TABLE no_event_snapshot AS SELECT to_jsonb(s) AS value FROM public.supporters s
  WHERE user_id='00000000-0000-0000-0000-000000000908';
SELECT ok((SELECT type='one_time' AND status='active' AND tier='scav' AND expires_at=now()+interval '29 days'
  FROM public.supporter_entitlements WHERE user_id='00000000-0000-0000-0000-000000000908'),
  'read-time entitlement resumes after grace without a write or another event');
SELECT is((SELECT to_jsonb(s) FROM public.supporters s WHERE user_id='00000000-0000-0000-0000-000000000908'),
  (SELECT value FROM no_event_snapshot),'entitlement projection does not mutate the billing row');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000908","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.supporter_entitlements),1,'entitlement view preserves owner RLS');
RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated','public.refund_one_time_supporter(text,uuid,timestamptz,integer,text)','EXECUTE'),
  'browser cannot apply bank refunds');
SELECT set_config('request.headers','{}',true);
SELECT throws_ok($$SELECT public.finish_stripe_event('evt_credit_rollout',
  (SELECT (claim->>'token')::uuid FROM credit_claim),'completed')$$,'40001',
  'Stripe completion requires updated webhook','old handler cannot acknowledge a read-only skipped bank refund');
-- A remaining lifetime receipt keeps unlimited duration, but not a refunded higher tier.
SELECT set_config('request.headers','{}',true);
INSERT INTO private.stripe_one_time_payments(payment_id,user_id,paid_at,amount_total,credit_tier)
VALUES ('pi_lifetime_kept','00000000-0000-0000-0000-000000000906','2026-10-06 00:00:00+00',400,'scav'),
 ('pi_lifetime_refunded','00000000-0000-0000-0000-000000000906','2026-10-06 00:00:00+00',1000,'chad');
UPDATE public.supporters SET one_time_tier='chad',one_time_remaining=NULL,one_time_legacy_unlimited=false
 WHERE user_id='00000000-0000-0000-0000-000000000906';
SELECT public.refund_one_time_supporter('pi_lifetime_refunded','00000000-0000-0000-0000-000000000906',
 '2026-10-06 00:00:00+00',1000);
SELECT ok((SELECT one_time_tier='scav' AND one_time_remaining IS NULL AND status='active' AND tier='chad'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000906'),
 'refund removes the higher lifetime tier while preserving another lifetime payment and subscription');
INSERT INTO public.supporters(user_id,type,status,tier,has_ever_supported,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000909','subscription','active','chad',true,'sub_legacy_refund');
UPDATE public.supporters SET one_time_tier='chad',one_time_remaining=NULL,one_time_legacy_unlimited=true
 WHERE user_id='00000000-0000-0000-0000-000000000909';
SELECT public.refund_one_time_supporter('pi_before_ledger','00000000-0000-0000-0000-000000000909',
 '2026-10-05 00:00:00+00',1000,'scav');
SELECT ok((SELECT one_time_tier='scav' AND one_time_legacy_unlimited AND one_time_remaining IS NULL
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000909'),
 'verified other legacy payment keeps its own lifetime tier');
SELECT public.refund_one_time_supporter('pi_last_before_ledger','00000000-0000-0000-0000-000000000909',
 '2026-10-05 00:00:00+00',400);
SELECT ok((SELECT one_time_tier IS NULL AND NOT one_time_legacy_unlimited AND status='active' AND tier='chad'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000909'),
 'refund of last pre-ledger payment clears lifetime bank without revoking subscription');
UPDATE public.supporters SET one_time_tier='chad',one_time_remaining=NULL,one_time_legacy_unlimited=true
 WHERE user_id='00000000-0000-0000-0000-000000000909';
SELECT pg_temp.pay(909,'pi_legacy_timed_kept');
SELECT public.refund_one_time_supporter('pi_legacy_last_with_prepaid','00000000-0000-0000-0000-000000000909',
 '2026-10-05 00:00:00+00',1000);
SELECT ok((SELECT one_time_tier='scav' AND one_time_remaining=interval '30 days'
 AND NOT one_time_legacy_unlimited AND status='active' AND tier='chad'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000909'),
 'last legacy refund preserves independently purchased prepaid days');

INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000910','subscription','active','chad','sub_exhausted'),
 ('00000000-0000-0000-0000-000000000911','subscription','active','chad','sub_unknown'),
 ('00000000-0000-0000-0000-000000000912','subscription','active','chad','sub_refund_exhausted');
SELECT pg_temp.pay(910,'pi_exhausted');
UPDATE public.supporters SET status='past_due',expires_at=now()-interval '31 days'
 WHERE user_id='00000000-0000-0000-0000-000000000910';
SELECT ok((SELECT NOT(status='active' AND (expires_at IS NULL OR expires_at>now()))
 FROM public.supporter_entitlements WHERE user_id='00000000-0000-0000-0000-000000000910'),
 'write after exhausted grace cannot project finite credit as unlimited');
SELECT pg_temp.pay(911,'pi_unknown_first');
UPDATE public.supporters SET status='past_due',expires_at=NULL
 WHERE user_id='00000000-0000-0000-0000-000000000911';
SELECT pg_temp.pay(911,'pi_unknown_second');
SELECT ok((SELECT type='subscription' AND status='past_due' AND one_time_remaining=interval '60 days'
 AND one_time_expires_at IS NULL FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000911'),
 'unknown subscription resume anchor preserves and stacks finite paused credit');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_unknown_second'),
 interval '30 days','payment during unknown grace keeps its refundable bank allocation');
SELECT pg_temp.pay(912,'pi_refund_exhausted_first');
SELECT pg_temp.pay(912,'pi_refund_exhausted_second');
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
UPDATE public.supporters SET status='past_due',expires_at=now()-interval '61 days'
 WHERE user_id='00000000-0000-0000-0000-000000000912';
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
SELECT public.refund_one_time_supporter('pi_refund_exhausted_first',
 '00000000-0000-0000-0000-000000000912','2026-10-07 00:00:00+00',400);
SELECT ok((SELECT NOT(status='active' AND (expires_at IS NULL OR expires_at>now()))
 FROM public.supporter_entitlements WHERE user_id='00000000-0000-0000-0000-000000000912'),
 'refund cannot turn an exhausted finite bank into unlimited access');
UPDATE public.supporters SET stripe_subscription_id=NULL
 WHERE user_id='00000000-0000-0000-0000-000000000911';
SELECT pg_temp.pay(911,'pi_unknown_without_id');
SELECT ok((SELECT type='subscription' AND status='past_due' AND one_time_remaining=interval '90 days'
 AND one_time_expires_at IS NULL FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000911'),
 'unknown resume anchor without subscription identity cannot turn finite credit unlimited');
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
INSERT INTO public.supporters(user_id,type,status,tier,has_ever_supported,expires_at)
VALUES ('00000000-0000-0000-0000-000000000913','one_time','active','scav',true,NULL);
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
SELECT pg_temp.pay(913,'pi_legacy_extra','2026-10-06 00:00:00+00');
SELECT ok((SELECT one_time_legacy_unlimited FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000913'),
 'fulfillment captures pre-ledger lifetime provenance before inserting another receipt');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
 stripe_subscription_id='sub_legacy_extra' WHERE user_id='00000000-0000-0000-0000-000000000913';
SELECT public.refund_one_time_supporter('pi_legacy_extra',
 '00000000-0000-0000-0000-000000000913','2026-10-06 00:00:00+00',400,'scav');
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),stripe_subscription_id=NULL
 WHERE user_id='00000000-0000-0000-0000-000000000913';
SELECT ok((SELECT type='one_time' AND status='active' AND tier='scav' AND expires_at IS NULL
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000913'),
 'refund of a later receipt preserves independently verified original lifetime access');
-- Actual unspent credit, rather than original paused allocations, controls running refunds.
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'subscription','active','chad','sub_running_'||n
FROM generate_series(914,920) n;
SELECT pg_temp.pay(914,'pi_running_old');
SELECT pg_temp.pay(914,'pi_running_new');
UPDATE public.supporters SET status='expired',expires_at=now()-interval '40 days',stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000914';
SELECT public.refund_one_time_supporter('pi_running_old','00000000-0000-0000-0000-000000000914','2026-10-07',400);
SELECT ok((SELECT type='one_time' AND status='active' AND expires_at=now()+interval '20 days'
 AND one_time_expires_at=expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000914'),
 'refund of fully spent oldest receipt preserves remaining newer running credit');
SELECT public.refund_one_time_supporter('pi_running_new','00000000-0000-0000-0000-000000000914','2026-10-07',400);
SELECT ok((SELECT one_time_tier IS NULL AND status='expired' AND expires_at<=now()
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000914'),
 'refund of partially spent newest receipt removes its actual remaining credit');
SELECT pg_temp.pay(915,'pi_running_partial_old');
SELECT pg_temp.pay(915,'pi_running_partial_new');
UPDATE public.supporters SET status='expired',expires_at=now()-interval '10 days',stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000915';
SELECT public.refund_one_time_supporter('pi_running_partial_old','00000000-0000-0000-0000-000000000915','2026-10-07',400);
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000915'),
 now()+interval '30 days','partly spent oldest running refund preserves all newer days');
SELECT pg_temp.pay(915,'pi_running_added');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_running_added'),
 NULL::interval,'ordinary running payment keeps its original receipt shape');
SELECT public.refund_one_time_supporter('pi_running_added','00000000-0000-0000-0000-000000000915','2026-10-07',400);
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000915'),
 now()+interval '30 days','post-resumption receipt without bank allocation refunds its purchased days');
SELECT public.refund_one_time_supporter('pi_running_added','00000000-0000-0000-0000-000000000915','2026-10-07',400);
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000915'),
 now()+interval '30 days','running refund replay subtracts no additional days');
SELECT pg_temp.pay(916,'pi_running_exhausted');
UPDATE public.supporters SET status='expired',expires_at=now()-interval '31 days',stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000916';
SELECT public.refund_one_time_supporter('pi_running_exhausted','00000000-0000-0000-0000-000000000916','2026-10-07',400);
SELECT ok((SELECT one_time_tier IS NULL AND NOT(status='active' AND (expires_at IS NULL OR expires_at>now()))
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000916'),
 'refund of exhausted bank cannot recreate running access');
SELECT pg_temp.pay(917,'pi_running_fenced_kept');
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000917';
SELECT public.refund_one_time_supporter('pi_running_fenced','00000000-0000-0000-0000-000000000917','2026-10-07',400);
SELECT pg_temp.pay(917,'pi_running_fenced');
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000917'),
 now()+interval '30 days','refund before checkout preserves other running credit and fences replay');
-- Known lifetime receipts and verified pre-ledger history must update the effective running tier.
SELECT pg_temp.pay(918,'pi_running_lifetime_kept','2026-10-06');
SELECT public.fulfill_one_time_supporter('pi_running_lifetime_refunded','2026-10-06',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000918','tier','chad','amount_total',1200));
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000918';
SELECT public.refund_one_time_supporter('pi_running_lifetime_refunded','00000000-0000-0000-0000-000000000918','2026-10-06',1200);
SELECT ok((SELECT tier='scav' AND one_time_tier='scav' AND expires_at IS NULL AND status='active'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000918'),
 'running lifetime refund downgrades to remaining payment tier');
UPDATE public.supporters SET one_time_tier='chad',one_time_legacy_unlimited=true
WHERE user_id='00000000-0000-0000-0000-000000000919';
SELECT pg_temp.pay(919,'pi_running_legacy_finite');
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000919';
SELECT public.refund_one_time_supporter('pi_running_legacy_high','00000000-0000-0000-0000-000000000919','2026-10-06',1200,'scav');
SELECT ok((SELECT tier='scav' AND one_time_tier='scav' AND expires_at IS NULL AND one_time_legacy_unlimited
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000919'),
 'verified running pre-ledger refund preserves another lifetime tier without trigger overwrite');
SELECT public.refund_one_time_supporter('pi_running_legacy_original','00000000-0000-0000-0000-000000000919','2026-10-06',1200,NULL);
SELECT ok((SELECT tier='scav' AND one_time_tier='scav' AND expires_at=now()+interval '30 days'
 AND NOT one_time_legacy_unlimited AND one_time_expires_at=expires_at
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000919'),
 'last running pre-ledger lifetime refund starts independently purchased finite credit');
SELECT pg_temp.pay(920,'pi_running_tier_low');
SELECT public.fulfill_one_time_supporter('pi_running_tier_high','2026-10-07',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000920','tier','chad','amount_total',400));
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000000920';
SELECT public.refund_one_time_supporter('pi_running_tier_high','00000000-0000-0000-0000-000000000920','2026-10-07',400);
SELECT ok((SELECT tier='scav' AND one_time_tier='scav' AND expires_at=now()+interval '30 days'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000920'),
 'running finite refund uses highest remaining paid tier without trigger overwrite');
-- Recovery must pause only credit left after read-time use beyond the grace deadline.
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000921','subscription','active','chad','sub_recover_partial'),
 ('00000000-0000-0000-0000-000000000922','subscription','active','chad','sub_recover_exhausted');
SELECT pg_temp.pay(921,'pi_recover_partial_old');
SELECT pg_temp.pay(921,'pi_recover_partial_new');
SELECT pg_temp.pay(922,'pi_recover_exhausted_old');
SELECT pg_temp.pay(922,'pi_recover_exhausted_new');
-- Time passes without another webhook or write, leaving the original raw paused balance.
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
UPDATE public.supporters SET status='past_due',expires_at=now()-interval '10 days'
 WHERE user_id='00000000-0000-0000-0000-000000000921';
UPDATE public.supporters SET status='past_due',expires_at=now()-interval '61 days'
 WHERE user_id='00000000-0000-0000-0000-000000000922';
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
SELECT is((SELECT expires_at FROM public.supporter_entitlements
 WHERE user_id='00000000-0000-0000-0000-000000000921'),now()+interval '50 days',
 'read-time credit has already spent ten days before subscription recovery');
UPDATE public.supporters SET status='active',expires_at=NULL
 WHERE user_id IN ('00000000-0000-0000-0000-000000000921','00000000-0000-0000-0000-000000000922');
SELECT is((SELECT one_time_remaining FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000921'),interval '50 days',
 'recovering subscription pauses only actual unspent projected credit');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_recover_partial_old'),
 interval '20 days','recovery updates the partly spent receipt allocation');
UPDATE public.supporters SET updated_at=now()
 WHERE user_id='00000000-0000-0000-0000-000000000921';
SELECT is((SELECT one_time_remaining FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000921'),interval '50 days',
 'replayed recovery does not spend the projected days again');
SELECT ok((SELECT type='subscription' AND status='active' AND one_time_tier IS NULL
 AND one_time_remaining IS NULL AND one_time_expires_at IS NULL
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000922'),
 'recovery clears fully spent credit while preserving current subscription access');
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
 WHERE user_id IN ('00000000-0000-0000-0000-000000000921','00000000-0000-0000-0000-000000000922');
SELECT is((SELECT expires_at FROM public.supporter_entitlements
 WHERE user_id='00000000-0000-0000-0000-000000000921'),now()+interval '50 days',
 'ending recovered subscription resumes fifty days instead of double-granting sixty');
SELECT ok((SELECT one_time_tier IS NULL AND NOT(status='active' AND (expires_at IS NULL OR expires_at>now()))
 FROM public.supporter_entitlements WHERE user_id='00000000-0000-0000-0000-000000000922'),
 'ending recovered subscription cannot resurrect fully spent projected credit');
-- Ordinary subscription revocation preserves its independently purchased bank.
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id)
VALUES ('00000000-0000-0000-0000-000000000923','subscription','active','chad','sub_invoice_refund');
SELECT pg_temp.pay(923,'pi_invoice_refund_bank');
UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),subscription_ended_at=now(),
 stripe_subscription_id=NULL,has_ever_supported=true,retention_history_verified=true
 WHERE user_id='00000000-0000-0000-0000-000000000923';
SELECT ok((SELECT type='one_time' AND status='active' AND tier='scav' AND one_time_tier='scav'
 AND expires_at=now()+interval '30 days' AND one_time_remaining IS NULL AND has_ever_supported
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000923'),
 'ordinary subscription invoice refund resumes independently paid credit');
-- A pre-grace read delivered after grace keeps the database's original resume anchor.
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
INSERT INTO public.supporters(user_id,type,status,tier,stripe_subscription_id,expires_at,one_time_tier,one_time_remaining)
VALUES ('00000000-0000-0000-0000-000000000930','subscription','past_due','chad','sub_read_race',now()-interval '1 day','scav',interval '30 days'),
 ('00000000-0000-0000-0000-000000000931','subscription','past_due','chad','sub_spent_read_race',now()-interval '31 days','scav',interval '30 days');
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
UPDATE public.supporters SET status='expired',tier='supporter',subscription_ended_at=expires_at,expires_at=now(),stripe_subscription_id=NULL
 WHERE user_id IN ('00000000-0000-0000-0000-000000000930','00000000-0000-0000-0000-000000000931');
SELECT ok((SELECT type='one_time' AND tier='scav' AND expires_at=now()+interval '29 days'
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000930'),
 'late revocation resumes only unused bank at original grace deadline');
SELECT ok((SELECT one_time_tier IS NULL AND status='expired' AND expires_at<=now()
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000931'),
 'late revocation leaves fully spent credit expired under the row lock');
-- Keep the original open-ended tier separate from modern upgrades, without inventing a receipt.
ALTER TABLE public.supporters DISABLE TRIGGER zz_preserve_one_time_credit;
INSERT INTO public.supporters(user_id,type,status,tier,has_ever_supported,expires_at)
VALUES ('00000000-0000-0000-0000-000000000924','one_time','active','scav',true,NULL),
 ('00000000-0000-0000-0000-000000000925','one_time','active','scav',true,NULL);
ALTER TABLE public.supporters ENABLE TRIGGER zz_preserve_one_time_credit;
SELECT public.fulfill_one_time_supporter('pi_original_upgrade','2026-10-07',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000924','tier','chad','amount_total',1200));
SELECT public.refund_one_time_supporter('pi_original_upgrade','00000000-0000-0000-0000-000000000924','2026-10-07',1200);
SELECT ok((SELECT tier='scav' AND expires_at IS NULL AND one_time_legacy_unlimited AND has_ever_supported
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000924'),
 'modern refund restores original unknown-provenance Scav lifetime without Stripe history');
SELECT public.fulfill_one_time_supporter('pi_original_timmy','2026-10-07',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000924','tier','timmy','amount_total',800));
SELECT public.fulfill_one_time_supporter('pi_original_chad_again','2026-10-07',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000924','tier','chad','amount_total',1200));
SELECT public.refund_one_time_supporter('pi_original_chad_again','00000000-0000-0000-0000-000000000924','2026-10-07',1200);
SELECT is((SELECT tier FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000924'),
 'timmy','original lifetime coexists with the highest remaining modern upgrade');
SELECT public.refund_one_time_supporter('pi_original_timmy','00000000-0000-0000-0000-000000000924','2026-10-07',800);
SELECT is((SELECT tier FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000924'),
 'scav','refunding all modern upgrades preserves only original lifetime tier');
CREATE TEMP TABLE legacy_upgrade_snapshot AS SELECT to_jsonb(s) value FROM public.supporters s
 WHERE user_id='00000000-0000-0000-0000-000000000924';
SELECT is(to_jsonb(public.refund_one_time_supporter('pi_original_timmy',
 '00000000-0000-0000-0000-000000000924','2026-10-07',800)),(SELECT value FROM legacy_upgrade_snapshot),
 'modern lifetime-upgrade refund replay preserves the complete current row');
UPDATE public.supporters SET type='subscription',status='active',tier='chad',stripe_subscription_id='sub_original_tier'
 WHERE user_id='00000000-0000-0000-0000-000000000925';
SELECT public.fulfill_one_time_supporter('pi_original_paused_upgrade','2026-10-07',
 jsonb_build_object('user_id','00000000-0000-0000-0000-000000000925','tier','chad','amount_total',1200));
SELECT public.refund_one_time_supporter('pi_original_paused_upgrade','00000000-0000-0000-0000-000000000925','2026-10-07',1200);
SELECT ok((SELECT tier='chad' AND one_time_tier='scav' AND one_time_legacy_unlimited
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000925'),
 'modern refund preserves original lifetime tier independently of live subscription');
UPDATE public.supporters SET status='expired',expires_at=now(),stripe_subscription_id=NULL
 WHERE user_id='00000000-0000-0000-0000-000000000925';
SELECT ok((SELECT type='one_time' AND tier='scav' AND expires_at IS NULL
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000925'),
 'subscription end restores original lifetime tier after modern refund');
-- A delayed lifetime payment cannot erase how much finite time was already spent.
SELECT pg_temp.pay(926,'pi_before_delayed_lifetime');
UPDATE public.supporters SET expires_at=now()+interval '29 days'
 WHERE user_id='00000000-0000-0000-0000-000000000926';
SELECT pg_temp.pay(926,'pi_delayed_lifetime','2026-10-06');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_before_delayed_lifetime'),
 interval '29 days','lifetime transition banks actual remaining finite days before discarding expiry');
SELECT public.refund_one_time_supporter('pi_delayed_lifetime','00000000-0000-0000-0000-000000000926','2026-10-06',400);
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000926'),
 now()+interval '29 days','delayed lifetime refund restores twenty-nine finite days instead of thirty');
CREATE TEMP TABLE delayed_lifetime_snapshot AS SELECT to_jsonb(s) value FROM public.supporters s
 WHERE user_id='00000000-0000-0000-0000-000000000926';
SELECT is(to_jsonb(public.refund_one_time_supporter('pi_delayed_lifetime',
 '00000000-0000-0000-0000-000000000926','2026-10-06',400)),(SELECT value FROM delayed_lifetime_snapshot),
 'delayed lifetime refund replay cannot restore spent days');
SELECT pg_temp.pay(927,'pi_delayed_stack_old');
SELECT pg_temp.pay(927,'pi_delayed_stack_new');
UPDATE public.supporters SET expires_at=now()+interval '20 days'
 WHERE user_id='00000000-0000-0000-0000-000000000927';
SELECT pg_temp.pay(927,'pi_delayed_stack_lifetime','2026-10-06');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_delayed_stack_old'),
 interval '0','lifetime transition records zero for a fully spent older receipt');
SELECT is((SELECT banked_duration FROM private.stripe_one_time_payments WHERE payment_id='pi_delayed_stack_new'),
 interval '20 days','lifetime transition allocates the actual unspent tail newest first');
SELECT public.refund_one_time_supporter('pi_delayed_stack_lifetime','00000000-0000-0000-0000-000000000927','2026-10-06',400);
SELECT public.refund_one_time_supporter('pi_delayed_stack_old','00000000-0000-0000-0000-000000000927','2026-10-07',400);
SELECT is((SELECT expires_at FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000927'),
 now()+interval '20 days','refunding a spent older receipt after lifetime refund preserves newer days');
SELECT pg_temp.pay(928,'pi_delayed_exhausted_finite');
UPDATE public.supporters SET expires_at=now()-interval '1 day'
 WHERE user_id='00000000-0000-0000-0000-000000000928';
SELECT pg_temp.pay(928,'pi_delayed_exhausted_lifetime','2026-10-06');
SELECT public.refund_one_time_supporter('pi_delayed_exhausted_lifetime','00000000-0000-0000-0000-000000000928','2026-10-06',400);
SELECT ok((SELECT one_time_tier IS NULL AND status='expired' AND expires_at<=now()
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000928'),
 'refunding delayed lifetime cannot resurrect an exhausted finite payment');
SELECT pg_temp.pay(928,'pi_delayed_exhausted_lifetime','2026-10-06');
SELECT ok((SELECT one_time_tier IS NULL AND status='expired' AND expires_at<=now()
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000928'),
 'refunded delayed lifetime checkout replay cannot resurrect access');
SELECT pg_temp.pay(929,'pi_delayed_paused_finite');
UPDATE public.supporters SET expires_at=now()+interval '17 days'
 WHERE user_id='00000000-0000-0000-0000-000000000929';
UPDATE public.supporters SET type='subscription',status='active',tier='chad',expires_at=NULL,
 stripe_subscription_id='sub_delayed_paused' WHERE user_id='00000000-0000-0000-0000-000000000929';
SELECT pg_temp.pay(929,'pi_delayed_paused_lifetime','2026-10-06');
SELECT public.refund_one_time_supporter('pi_delayed_paused_lifetime','00000000-0000-0000-0000-000000000929','2026-10-06',400);
SELECT is((SELECT one_time_remaining FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000929'),
 interval '17 days','delayed lifetime refund keeps actual finite balance paused during valid subscription');
SELECT is((SELECT one_time_legacy_tier FROM public.supporters
 WHERE user_id='00000000-0000-0000-0000-000000000924'),'scav',
 'original lifetime tier is durable after repeated modern upgrade refunds');
SELECT is((SELECT count(*) FROM private.stripe_one_time_payments
 WHERE user_id='00000000-0000-0000-0000-000000000924'),3::bigint,
 'unknown lifetime provenance is preserved without inventing a Stripe receipt');
SELECT ok(NOT has_column_privilege('authenticated','public.supporters','one_time_legacy_tier','UPDATE'),
 'browser cannot change durable original lifetime tier');
SELECT ok(NOT has_function_privilege('authenticated','private.allocate_one_time_credit(uuid,interval,text)','EXECUTE'),
 'browser cannot reallocate payment credit');
SELECT ok(has_function_privilege('service_role','private.allocate_one_time_credit(uuid,interval,text)','EXECUTE'),
 'billing service can allocate credit inside supporter writes');
SELECT public.disqualify_supporter_customer('cus_original_denial','00000000-0000-0000-0000-000000000924');
SELECT ok((SELECT one_time_legacy_tier IS NULL AND NOT one_time_legacy_unlimited AND NOT has_ever_supported
 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000000924'),
 'chargeback clears durable lifetime provenance as well as current credit');
CREATE FUNCTION pg_temp.entitlement_lookup_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE plan json;
BEGIN
 EXECUTE 'EXPLAIN (FORMAT JSON) SELECT tier FROM public.supporter_entitlements WHERE user_id=''00000000-0000-0000-0000-000000000913''' INTO plan;
 RETURN plan::text;
END; $$;
SET LOCAL enable_seqscan=off;
SELECT ok(pg_temp.entitlement_lookup_plan() LIKE '%Index Cond%',
 'service-role entitlement lookup pushes user identity into an index condition');
SELECT * FROM finish();
ROLLBACK;
