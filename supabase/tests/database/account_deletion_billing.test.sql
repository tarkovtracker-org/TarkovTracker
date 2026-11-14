BEGIN;
SELECT plan(30);
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-000000009501', 'billing-delete@example.invalid'),
  ('00000000-0000-0000-0000-000000009502', 'free-delete@example.invalid'),
  ('00000000-0000-0000-0000-000000009503', 'legacy-billing@example.invalid');
INSERT INTO public.supporters(user_id, stripe_subscription_id, stripe_customer_id, status, type)
VALUES ('00000000-0000-0000-0000-000000009501', 'sub_first', 'cus_first', 'active', 'subscription'),
  ('00000000-0000-0000-0000-000000009503', NULL, 'cus_legacy', 'expired', 'one_time');
SELECT throws_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009501'$$,
  '23514', 'account_deletion_subscription_active', 'Auth deletion cannot cascade a live billing identity');
UPDATE public.supporters SET status='past_due' WHERE stripe_subscription_id='sub_first';
SELECT throws_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009501'$$,
  '23514', 'account_deletion_subscription_active', 'past-due subscriptions remain protected');
UPDATE public.supporters SET status='cancelled', stripe_subscription_id=NULL
WHERE user_id='00000000-0000-0000-0000-000000009501';
SELECT throws_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009501'$$,
  '23514', 'account_deletion_subscription_active', 'entitlement revocation cannot erase billing identity');
UPDATE public.supporters SET stripe_subscription_id='sub_second', stripe_customer_id='cus_second'
WHERE user_id='00000000-0000-0000-0000-000000009501';
SELECT is((SELECT count(*) FROM public.account_billing_subscriptions
  WHERE user_id='00000000-0000-0000-0000-000000009501'), 2::bigint, 'two Checkouts on distinct customers retain both subscriptions');
SELECT public.record_account_billing_subscription('00000000-0000-0000-0000-000000009501','sub_third');
SELECT is((SELECT count(*) FROM public.account_billing_subscriptions
  WHERE user_id='00000000-0000-0000-0000-000000009501'),3::bigint, 'a signed event retains a subscription even without changing current entitlement');
SELECT throws_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009503'$$,
  '23514', 'account_deletion_subscription_active', 'legacy cleared subscription requires customer-wide verification');
SELECT * FROM public.claim_account_deletion_job('00000000-0000-0000-0000-000000009501', true);
UPDATE public.account_deletion_jobs SET status='failed', next_run_at=now()-interval '1 day'
WHERE user_id='00000000-0000-0000-0000-000000009501';
SELECT throws_ok($$SELECT private.retry_account_deletion('00000000-0000-0000-0000-000000009501')$$,
  '23514', 'account_deletion_subscription_active', 'scheduled SQL retry cannot bypass the guard');
SELECT ok(EXISTS(SELECT 1 FROM public.supporters WHERE stripe_subscription_id='sub_second'), 'failed retry retains billing identity');
SELECT * FROM public.claim_account_deletion_job('00000000-0000-0000-0000-000000009501', true);
SELECT throws_ok($$UPDATE public.supporters SET stripe_subscription_id='sub_racing'
  WHERE user_id='00000000-0000-0000-0000-000000009501'$$,
  '23514', 'account_deletion_in_progress', 'billing activation cannot enter the destructive deletion stage');
SELECT throws_ok($$SELECT public.record_account_billing_subscription('00000000-0000-0000-0000-000000009501','sub_racing')$$,
  '23514','account_deletion_in_progress','signed events retry while deletion holds the account');
CREATE FUNCTION pg_temp.clear_billing(sub_id text, customer_id text, ids text[], token uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql AS $$
 SELECT public.clear_ended_deletion_subscription('00000000-0000-0000-0000-000000009501', sub_id,
 customer_id, coalesce(token, (SELECT claim_token FROM public.account_deletion_jobs
 WHERE user_id='00000000-0000-0000-0000-000000009501')), ids);
$$;
SELECT is(pg_temp.clear_billing('sub_second','cus_second',ARRAY['sub_first','sub_second','sub_third'],
  '00000000-0000-0000-0000-000000000000'), false, 'stale claimant cannot clear billing');
SELECT is(pg_temp.clear_billing('sub_replaced','cus_second',ARRAY['sub_first','sub_second','sub_third']), false, 'changed subscription invalidates verification');
SELECT is(pg_temp.clear_billing('sub_second','cus_replaced',ARRAY['sub_first','sub_second','sub_third']), false, 'changed customer invalidates verification');
SELECT is(pg_temp.clear_billing('sub_second','cus_second',ARRAY['sub_second']), false, 'incomplete subscription history cannot be cleared');
UPDATE public.account_deletion_jobs SET updated_at=now()-interval '1 hour'
WHERE user_id='00000000-0000-0000-0000-000000009501';
SELECT is(pg_temp.clear_billing('sub_second','cus_second',ARRAY['sub_first','sub_second','sub_third']), false, 'expired lease cannot clear billing');
UPDATE public.account_deletion_jobs SET updated_at=now()
WHERE user_id='00000000-0000-0000-0000-000000009501';
SELECT ok(NOT has_function_privilege('authenticated',
  'public.clear_ended_deletion_subscription(uuid,text,text,uuid,text[])','EXECUTE'), 'clients cannot attest to termination');
SELECT ok(NOT has_function_privilege('anon',
  'private.clear_ended_deletion_subscription(uuid,text,text,uuid,text[])','EXECUTE'), 'private clearance has no anonymous execution');
SELECT ok(has_function_privilege('service_role',
  'public.clear_ended_deletion_subscription(uuid,text,text,uuid,text[])','EXECUTE'), 'trusted deletion worker can clear verification');
SELECT ok(NOT has_table_privilege('authenticated','public.account_billing_subscriptions','INSERT'), 'clients cannot forge billing history');
SELECT ok(NOT has_table_privilege('anon','public.account_billing_subscriptions','SELECT'), 'billing history is not public');
SELECT ok(NOT has_table_privilege('service_role','public.account_billing_subscriptions','INSERT'), 'service writes use the serialized recorder');
SELECT ok(NOT has_function_privilege('authenticated','public.record_account_billing_subscription(uuid,text)','EXECUTE'), 'clients cannot record subscription identity');
SELECT is(pg_temp.clear_billing('sub_second','cus_second',ARRAY['sub_first','sub_second','sub_third']), true, 'current fenced worker clears complete verified history');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.account_billing_subscriptions
  WHERE user_id='00000000-0000-0000-0000-000000009501'), 'clearance removes all verified subscription links');
SELECT ok((SELECT stripe_customer_id IS NULL AND stripe_subscription_id IS NULL FROM public.supporters
  WHERE user_id='00000000-0000-0000-0000-000000009501'), 'verified customer identity is cleared atomically');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009501'$$, 'verified ended subscriptions preserve legitimate deletion');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009502'$$, 'accounts without billing can still be deleted');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.supporters WHERE user_id='00000000-0000-0000-0000-000000009501'), 'normal cascade follows verification');
SELECT * FROM public.claim_account_deletion_job('00000000-0000-0000-0000-000000009503', true);
SELECT is(public.clear_ended_deletion_subscription('00000000-0000-0000-0000-000000009503',NULL,'cus_legacy',
  (SELECT claim_token FROM public.account_deletion_jobs WHERE user_id='00000000-0000-0000-0000-000000009503'),ARRAY[]::text[]), true,
  'verified customer without recurring subscriptions can proceed');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000009503'$$, 'nonrecurring customer preserves legitimate deletion');
SELECT * FROM finish();
ROLLBACK;
