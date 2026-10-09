BEGIN;
SELECT no_plan();
SELECT set_config('request.headers', '{}', true);
INSERT INTO auth.users(id,email) SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  'one-time-credit-' || n || '@example.invalid' FROM generate_series(901,904) n;
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
SELECT * FROM finish();
ROLLBACK;
