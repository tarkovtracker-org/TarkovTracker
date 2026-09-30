BEGIN;
SELECT plan(74);

-- Each fixture has old Auth history; remove provisioning's freshly-created progress
-- so eligibility tests measure the intended activity and billing evidence.
CREATE TEMP TABLE retention_fixture (name text PRIMARY KEY, user_id uuid NOT NULL);
INSERT INTO retention_fixture
SELECT name, ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
FROM (VALUES
  (1001, 'inactive'), (1002, 'recent'), (1003, 'active_supporter'),
  (1004, 'former_recent'), (1005, 'former_old'), (1006, 'ended_recent'),
  (1007, 'refunded'), (1008, 'unknown'), (1009, 'charged_back'),
  (1010, 'delete_owner'), (1011, 'successor'), (1012, 'signed_in'),
  (1013, 'preferences'), (1014, 'api_user'), (1015, 'telemetry'), (1016, 'before_checkout'), (1017, 'unknown_customer')
) AS fixtures(n, name);
CREATE FUNCTION pg_temp.retention_user(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT user_id FROM retention_fixture WHERE name = p_name;
$$;
INSERT INTO auth.users(id, email, created_at, last_sign_in_at)
SELECT user_id, name || '-retention@example.invalid', now() - interval '2 years',
  now() - interval '2 years' FROM retention_fixture;
DELETE FROM public.user_progress WHERE user_id IN (SELECT user_id FROM retention_fixture);
DELETE FROM public.user_game_mode_progress WHERE user_id IN (SELECT user_id FROM retention_fixture);
DELETE FROM private.account_retention WHERE user_id IN (SELECT user_id FROM retention_fixture);

SELECT ok(private.account_retention_deadline(pg_temp.retention_user('inactive')) < now(),
  'never-supporter becomes eligible after six months');
SELECT public.record_account_activity(pg_temp.retention_user('recent'));
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('recent')) > now() + interval '5 months',
  'durable activity extends the six-month deadline');

INSERT INTO public.supporters(user_id, type, status, has_ever_supported,
  retention_history_verified, last_contribution_at, subscription_ended_at, updated_at)
VALUES
  (pg_temp.retention_user('active_supporter'), 'subscription', 'active', true, true, now() - interval '2 years', NULL, now() - interval '2 years'),
  (pg_temp.retention_user('former_recent'), 'one_time', 'expired', true, true, now() - interval '8 months', NULL, now() - interval '2 years'),
  (pg_temp.retention_user('former_old'), 'one_time', 'expired', true, true, now() - interval '14 months', NULL, now() - interval '2 years'),
  (pg_temp.retention_user('ended_recent'), 'subscription', 'cancelled', true, true, now() - interval '2 years', now() - interval '2 months', now() - interval '2 years'),
  (pg_temp.retention_user('refunded'), 'one_time', 'expired', false, true, now() - interval '1 month', now() - interval '1 month', now() - interval '2 years'),
  (pg_temp.retention_user('unknown'), 'one_time', 'expired', false, false, NULL, NULL, now() - interval '2 years'),
  (pg_temp.retention_user('charged_back'), 'subscription', 'active', true, true, now() - interval '1 month', NULL, now() - interval '2 years');
SELECT is(private.account_retention_deadline(pg_temp.retention_user('active_supporter')), NULL::timestamptz,
  'active subscription protects an inactive account');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('former_recent')) > now(),
  'former contribution receives a full year');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('former_old')) < now(),
  'former supporter becomes eligible after a year');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('ended_recent')) > now(),
  'subscription end anchors former supporter retention');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('refunded')) < now(),
  'verified refunded account ignores old contribution and subscription dates');
SELECT is(private.account_retention_deadline(pg_temp.retention_user('unknown')), NULL::timestamptz,
  'unknown legacy payment history protects account');
UPDATE public.supporters SET supporter_disqualified_at = now() - interval '1 day'
WHERE user_id = pg_temp.retention_user('charged_back');
SELECT is((SELECT has_ever_supported FROM public.supporters WHERE user_id = pg_temp.retention_user('charged_back')),
  false, 'chargeback marker enforces revoked supporter history');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('charged_back')) < now(),
  'chargeback overrides active subscription protection');
UPDATE public.supporters SET has_ever_supported = true, status = 'active'
WHERE user_id = pg_temp.retention_user('charged_back');
SELECT is((SELECT has_ever_supported FROM public.supporters WHERE user_id = pg_temp.retention_user('charged_back')),
  false, 'stale billing update cannot revive disqualified entitlement');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('charged_back')) < now(),
  'stale active status still cannot revive retention protection');

UPDATE public.supporters SET supporter_disqualified_at = NULL
WHERE user_id = pg_temp.retention_user('charged_back');
SELECT ok((SELECT supporter_disqualified_at IS NOT NULL FROM public.supporters
  WHERE user_id = pg_temp.retention_user('charged_back')), 'billing cannot clear durable chargeback marker');
SELECT is((SELECT status FROM public.supporters WHERE user_id = pg_temp.retention_user('charged_back')),
  'cancelled', 'chargeback marker forces cancelled subscription status');

-- Chargeback denial exists independently of the first checkout/supporter row.
SELECT public.disqualify_supporter_customer('cus_retention_before', pg_temp.retention_user('before_checkout'));
SELECT is((SELECT user_id FROM private.supporter_chargebacks WHERE customer_id = 'cus_retention_before'),
  pg_temp.retention_user('before_checkout'), 'chargeback records account before first supporter row');
CREATE TEMP TABLE chargeback_snapshot AS SELECT disqualified_at FROM private.supporter_chargebacks
WHERE customer_id = 'cus_retention_before';
SELECT public.disqualify_supporter_customer('cus_retention_before', pg_temp.retention_user('before_checkout'));
SELECT is((SELECT disqualified_at FROM private.supporter_chargebacks WHERE customer_id = 'cus_retention_before'),
  (SELECT disqualified_at FROM chargeback_snapshot), 'repeated chargeback preserves original date');
INSERT INTO public.supporters(user_id, stripe_customer_id, type, status, has_ever_supported,
  retention_history_verified, last_contribution_at)
VALUES (pg_temp.retention_user('before_checkout'), 'cus_retention_before', 'subscription', 'active', true, true, now());
SELECT is((SELECT has_ever_supported FROM public.supporters WHERE user_id = pg_temp.retention_user('before_checkout')),
  false, 'first checkout cannot override prior chargeback');
-- Recreating a row with a different customer must still match account-level denial.
DELETE FROM public.supporters WHERE user_id = pg_temp.retention_user('before_checkout');
INSERT INTO public.supporters(user_id, stripe_customer_id, type, status, has_ever_supported,
  retention_history_verified, last_contribution_at)
VALUES (pg_temp.retention_user('before_checkout'), 'cus_retention_new', 'subscription', 'active', true, true, now());
SELECT is((SELECT has_ever_supported FROM public.supporters WHERE user_id = pg_temp.retention_user('before_checkout')),
  false, 'new customer payment cannot evade durable account chargeback');
SELECT public.disqualify_supporter_customer('cus_retention_unknown');
INSERT INTO public.supporters(user_id, stripe_customer_id, type, status, has_ever_supported,
  retention_history_verified, last_contribution_at)
VALUES (pg_temp.retention_user('unknown_customer'), 'cus_retention_unknown', 'subscription', 'active', true, true, now());
SELECT is((SELECT has_ever_supported FROM public.supporters WHERE user_id = pg_temp.retention_user('unknown_customer')),
  false, 'customer denial without known account still blocks first checkout');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.disqualify_supporter_customer('cus_client_attempt')$$,
  '42501', NULL, 'ordinary clients cannot disqualify supporter customers');
RESET ROLE;

-- No account can be removed on its first eligibility pass.
SELECT private.run_inactive_account_cleanup(100);
SELECT ok((SELECT pending_since IS NOT NULL FROM private.account_retention
  WHERE user_id = pg_temp.retention_user('inactive')), 'cleanup queues eligible account');
SELECT is(private.delete_inactive_account(pg_temp.retention_user('inactive')), false,
  'new queue cannot bypass thirty-day grace');
UPDATE private.account_retention SET pending_since = now() - interval '29 days'
WHERE user_id = pg_temp.retention_user('inactive');
SELECT is(private.delete_inactive_account(pg_temp.retention_user('inactive')), false,
  'twenty-nine-day queue remains protected');
SELECT public.record_account_activity(pg_temp.retention_user('inactive'));
SELECT ok((SELECT pending_since IS NULL AND last_active_at > now() - interval '1 minute'
  FROM private.account_retention WHERE user_id = pg_temp.retention_user('inactive')),
  'activity cancels a pending cleanup');
SELECT is(private.delete_inactive_account(pg_temp.retention_user('inactive')), false,
  'cancelled account cannot be deleted');
CREATE TEMP TABLE activity_snapshot AS SELECT last_active_at FROM private.account_retention
WHERE user_id = pg_temp.retention_user('inactive');
SELECT public.record_account_activity(pg_temp.retention_user('inactive'));
SELECT is((SELECT last_active_at FROM private.account_retention WHERE user_id = pg_temp.retention_user('inactive')),
  (SELECT last_active_at FROM activity_snapshot), 'same-day heartbeats avoid redundant writes');

UPDATE auth.users SET last_sign_in_at = now() WHERE id = pg_temp.retention_user('signed_in');
SELECT ok((SELECT last_active_at > now() - interval '1 minute' FROM private.account_retention
  WHERE user_id = pg_temp.retention_user('signed_in')), 'Auth sign-in records activity');
INSERT INTO public.user_preferences(user_id) VALUES (pg_temp.retention_user('preferences'));
SELECT ok((SELECT last_active_at > now() - interval '1 minute' FROM private.account_retention
  WHERE user_id = pg_temp.retention_user('preferences')), 'preference mutation records activity');
INSERT INTO public.api_usage_daily(user_id, token_id, day, throttled)
VALUES (pg_temp.retention_user('api_user'), 'retention-test', current_date, 1);
SELECT ok(NOT EXISTS (SELECT 1 FROM private.account_retention WHERE user_id = pg_temp.retention_user('api_user')
  AND last_active_at >= now() - interval '1 year'),
  'throttled-only API traffic does not record activity');
UPDATE public.api_usage_daily SET reads = 1 WHERE user_id = pg_temp.retention_user('api_user');
SELECT ok((SELECT last_active_at > now() - interval '1 minute' FROM private.account_retention
  WHERE user_id = pg_temp.retention_user('api_user')), 'admitted API traffic records activity');

-- Capture the historical timestamp itself, never snapshot execution time. The
-- former-supporter deadline must survive pruning of short-lived API telemetry.
INSERT INTO public.supporters(user_id, type, status, has_ever_supported,
  retention_history_verified, last_contribution_at, updated_at)
VALUES (pg_temp.retention_user('telemetry'), 'one_time', 'expired', true, true,
  now() - interval '2 years', now() - interval '2 years');
SET LOCAL session_replication_role = replica;
INSERT INTO public.api_usage_daily(user_id, token_id, day, reads, updated_at)
VALUES (pg_temp.retention_user('telemetry'), 'historic-api', current_date - 100, 1, now() - interval '100 days');
INSERT INTO private.account_retention(user_id, pending_since)
VALUES (pg_temp.retention_user('telemetry'), now() - interval '31 days')
ON CONFLICT(user_id) DO UPDATE SET pending_since = EXCLUDED.pending_since, last_active_at = NULL;
SET LOCAL session_replication_role = origin;
SELECT private.snapshot_account_activity();
SELECT is((SELECT last_active_at FROM private.account_retention WHERE user_id = pg_temp.retention_user('telemetry')),
  now() - interval '100 days', 'snapshot preserves one-hundred-day-old API timestamp');
SELECT is((SELECT pending_since FROM private.account_retention WHERE user_id = pg_temp.retention_user('telemetry')),
  now() - interval '31 days', 'snapshot does not renew pending grace period');
DELETE FROM public.api_usage_daily WHERE user_id = pg_temp.retention_user('telemetry');
SELECT is(private.account_retention_deadline(pg_temp.retention_user('telemetry')),
  now() - interval '100 days' + interval '1 year', 'former supporter retains historical API year after telemetry pruning');
SELECT private.snapshot_account_activity();
SELECT is((SELECT last_active_at FROM private.account_retention WHERE user_id = pg_temp.retention_user('telemetry')),
  now() - interval '100 days', 'repeated snapshots neither lose history nor manufacture new activity');

INSERT INTO auth.sessions(id, user_id, created_at, updated_at, refreshed_at)
VALUES ('00000000-0000-0000-0000-000000001098', pg_temp.retention_user('telemetry'),
  now() - interval '1 day', now() - interval '1 day', now() - interval '1 day');
SELECT private.snapshot_account_activity();
SELECT is((SELECT pending_since FROM private.account_retention WHERE user_id = pg_temp.retention_user('telemetry')),
  NULL::timestamptz, 'new session evidence cancels old cleanup grace');
SELECT ok(private.account_retention_deadline(pg_temp.retention_user('telemetry')) > now(),
  'returning session receives renewed supporter retention period');

-- Dependent-record fixtures use old timestamps deliberately. Setup-only replica
-- mode prevents maintenance triggers from manufacturing fresh activity.
INSERT INTO public.teams(id, name, join_code, owner_id, game_mode) VALUES
  ('00000000-0000-0000-0000-000000001020', 'Retention populated', 'retention-populated', pg_temp.retention_user('delete_owner'), 'pvp'),
  ('00000000-0000-0000-0000-000000001021', 'Retention empty', 'retention-empty', pg_temp.retention_user('delete_owner'), 'pve');
INSERT INTO public.team_memberships(team_id, user_id, role, game_mode) VALUES
  ('00000000-0000-0000-0000-000000001020', pg_temp.retention_user('delete_owner'), 'owner', 'pvp'),
  ('00000000-0000-0000-0000-000000001020', pg_temp.retention_user('successor'), 'member', 'pvp');
INSERT INTO public.team_events(team_id, event_type, initiated_by, target_user)
VALUES ('00000000-0000-0000-0000-000000001020', 'member_joined', pg_temp.retention_user('delete_owner'), pg_temp.retention_user('successor'));
SET LOCAL session_replication_role = replica;
INSERT INTO public.user_preferences(user_id, updated_at) VALUES (pg_temp.retention_user('delete_owner'), now() - interval '2 years');
INSERT INTO public.user_progress(user_id, updated_at) VALUES (pg_temp.retention_user('delete_owner'), now() - interval '2 years');
INSERT INTO public.account_ip_audit(user_id, ip_hash, last_seen_at)
VALUES (pg_temp.retention_user('delete_owner'), repeat('a', 64), now() - interval '2 years');
INSERT INTO public.api_usage_daily(user_id, token_id, day, reads, updated_at)
VALUES (pg_temp.retention_user('delete_owner'), 'delete-test', current_date - 730, 1, now() - interval '2 years');
INSERT INTO private.account_retention(user_id, pending_since)
VALUES (pg_temp.retention_user('delete_owner'), now() - interval '31 days')
ON CONFLICT(user_id) DO UPDATE SET pending_since = EXCLUDED.pending_since, last_active_at = NULL;
SET LOCAL session_replication_role = origin;
SELECT is(private.delete_inactive_account(pg_temp.retention_user('delete_owner')), true,
  'eligible thirty-day account deletes transactionally');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup removes Auth identity');
SELECT is((SELECT count(*)::integer FROM public.user_progress WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup cascades progress');
SELECT is((SELECT count(*)::integer FROM public.user_preferences WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup cascades preferences');
SELECT is((SELECT count(*)::integer FROM public.account_ip_audit WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup cascades IP audit');
SELECT is((SELECT count(*)::integer FROM public.api_usage_daily WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup explicitly removes API accounting');
SELECT is((SELECT count(*)::integer FROM private.account_retention WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'cleanup cascades private retention evidence');
SELECT is((SELECT owner_id FROM public.teams WHERE id = '00000000-0000-0000-0000-000000001020'),
  pg_temp.retention_user('successor'), 'populated team transfers ownership');
SELECT is((SELECT role FROM public.team_memberships WHERE team_id = '00000000-0000-0000-0000-000000001020'
  AND user_id = pg_temp.retention_user('successor')), 'owner', 'successor membership becomes owner');
SELECT is((SELECT count(*)::integer FROM public.teams WHERE id = '00000000-0000-0000-0000-000000001021'), 0,
  'empty owned team cascades');
SELECT is((SELECT status FROM public.account_deletion_jobs WHERE user_id = pg_temp.retention_user('delete_owner')),
  'completed', 'existing deletion audit records completed cleanup');
SELECT is(private.delete_inactive_account(pg_temp.retention_user('delete_owner')), false,
  'repeating deletion is harmless');

INSERT INTO public.api_usage_daily(user_id, token_id, day, reads)
VALUES (pg_temp.retention_user('delete_owner'), 'late-after-deletion', current_date, 1);
SELECT is((SELECT count(*)::integer FROM public.api_usage_daily WHERE user_id = pg_temp.retention_user('delete_owner')), 0,
  'late API accounting cannot recreate an orphan after Auth deletion');
INSERT INTO public.api_usage_daily(user_id, token_id, day, reads)
VALUES ('00000000-0000-0000-0000-000000001099', 'unknown-account', current_date, 1);
SELECT is((SELECT count(*)::integer FROM public.api_usage_daily WHERE user_id = '00000000-0000-0000-0000-000000001099'), 0,
  'API accounting for nonexistent Auth identity is ignored');

UPDATE private.account_retention SET pending_since = now() - interval '35 days'
WHERE user_id = pg_temp.retention_user('charged_back');
UPDATE public.supporters SET status = 'active', has_ever_supported = true
WHERE user_id = pg_temp.retention_user('charged_back');
SELECT is((SELECT pending_since FROM private.account_retention WHERE user_id = pg_temp.retention_user('charged_back')),
  now() - interval '35 days', 'rejected billing update cannot restart chargeback cleanup grace');
SELECT is(public.supporter_benefits_disqualified(pg_temp.retention_user('charged_back')), true,
  'checkout sees existing account disqualification');
SELECT is(public.supporter_benefits_disqualified(pg_temp.retention_user('active_supporter')), false,
  'valid active supporter is not disqualified');
SELECT ok(NOT has_function_privilege('authenticated', 'public.supporter_benefits_disqualified(uuid)', 'EXECUTE'),
  'ordinary clients cannot inspect disqualification of other accounts');
SELECT ok(has_function_privilege('service_role', 'public.supporter_benefits_disqualified(uuid)', 'EXECUTE'),
  'service role can check checkout eligibility');
SELECT ok(has_function_privilege('service_role', 'public.disqualify_supporter_customer(text,uuid)', 'EXECUTE'),
  'service role can persist chargeback history');

SELECT ok(NOT has_function_privilege(role, signature, 'EXECUTE'), role || ' cannot execute ' || signature)
FROM (VALUES ('anon'), ('authenticated')) roles(role)
CROSS JOIN (VALUES ('public.record_account_activity(uuid)'), ('private.account_retention_deadline(uuid)'),
  ('private.delete_inactive_account(uuid)'), ('private.run_inactive_account_cleanup(integer)'), ('private.account_last_activity(uuid)'),
  ('private.snapshot_account_activity()')) functions(signature);
SELECT ok(has_function_privilege('service_role', signature, 'EXECUTE'), 'service role can execute ' || signature)
FROM (VALUES ('public.record_account_activity(uuid)'), ('private.account_retention_deadline(uuid)'),
  ('private.run_inactive_account_cleanup(integer)'), ('private.snapshot_account_activity()')) functions(signature);
SELECT table_privs_are('private', 'account_retention', 'anon', ARRAY[]::text[], 'anon has no private retention privileges');
SELECT table_privs_are('private', 'account_retention', 'authenticated', ARRAY[]::text[], 'authenticated has no private retention privileges');
SELECT * FROM finish();
ROLLBACK;
