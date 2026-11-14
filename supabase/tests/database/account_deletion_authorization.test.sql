BEGIN;
SELECT plan(13);
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-000000009601', 'deletion-auth@example.invalid'),
  ('00000000-0000-0000-0000-000000009602', 'other-deletion-auth@example.invalid');
INSERT INTO auth.sessions(id, user_id, created_at, updated_at, not_after) VALUES
  ('00000000-0000-0000-0000-000000009611', '00000000-0000-0000-0000-000000009601', now(), now(), NULL),
  ('00000000-0000-0000-0000-000000009612', '00000000-0000-0000-0000-000000009602', now(), now(), NULL),
  ('00000000-0000-0000-0000-000000009613', '00000000-0000-0000-0000-000000009601', now(), now(), now()-interval '1 minute');
CREATE FUNCTION pg_temp.request_deletion(session_id uuid, authenticated_at timestamptz DEFAULT now())
RETURNS TABLE(claimed boolean, status text, claim_token uuid) LANGUAGE sql AS $$
  SELECT * FROM public.claim_requested_account_deletion_job(
    '00000000-0000-0000-0000-000000009601', session_id, authenticated_at);
$$;
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009611',now()-interval '6 minutes')$$,
  '28000','account_deletion_recent_login_required','old OAuth proof cannot claim deletion');
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009611',now()+interval '1 minute')$$,
  '28000','account_deletion_recent_login_required','future OAuth proof is rejected');
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009611',NULL)$$,
  '28000','account_deletion_recent_login_required','missing OAuth proof is rejected');
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009612')$$,
  '28000','account_deletion_recent_login_required','another account session is rejected');
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009613')$$,
  '28000','account_deletion_recent_login_required','expired session is rejected');
SELECT throws_ok($$SELECT pg_temp.request_deletion('00000000-0000-0000-0000-000000009614')$$,
  '28000','account_deletion_recent_login_required','revoked or absent session is rejected');
SELECT is((SELECT count(*) FROM public.account_deletion_jobs
  WHERE user_id='00000000-0000-0000-0000-000000009601'),0::bigint,'denials never create deletion intent/jobs');
SELECT ok(NOT has_function_privilege('anon',
  'public.claim_requested_account_deletion_job(uuid,uuid,timestamptz)','EXECUTE'),'anonymous cannot call request claim');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.claim_requested_account_deletion_job(uuid,uuid,timestamptz)','EXECUTE'),'ordinary clients cannot mint claims');
SELECT ok(NOT has_function_privilege('authenticated',
  'private.claim_requested_account_deletion_job(uuid,uuid,timestamptz)','EXECUTE'),'private implementation denies clients');
SELECT ok(has_function_privilege('service_role',
  'public.claim_requested_account_deletion_job(uuid,uuid,timestamptz)','EXECUTE'),'Edge service can claim');
SELECT ok((SELECT claimed AND claim_token IS NOT NULL FROM pg_temp.request_deletion(
  '00000000-0000-0000-0000-000000009611')),'fresh matching session claims one fenced job');
SELECT is((SELECT claimed FROM pg_temp.request_deletion('00000000-0000-0000-0000-000000009611')),
  false,'duplicate accepted intent does not create a parallel claim');
SELECT * FROM finish();
ROLLBACK;
