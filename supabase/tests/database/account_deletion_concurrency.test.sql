BEGIN;

SELECT plan(18);

\set rate_user '00000000-0000-0000-0000-000000000718'
\set job_user '00000000-0000-0000-0000-000000000719'
\set fence_user '00000000-0000-0000-0000-000000000720'
\set request_ip '127.0.0.1'
\set test_agent 'pgTAP'
\set execute_privilege 'EXECUTE'

INSERT INTO auth.users (id, email)
VALUES
  (:'rate_user', 'account-delete-718@example.invalid'),
  (:'job_user', 'account-delete-719@example.invalid'),
  (:'fence_user', 'account-delete-720@example.invalid');

SELECT results_eq(
  FORMAT(
    'SELECT allowed FROM public.consume_account_deletion_attempt(%L, %L, %L)',
    :'rate_user', :'request_ip', :'test_agent'
  ),
  $$ VALUES (TRUE) $$,
  'allows the first deletion attempt'
);
SELECT results_eq(
  FORMAT(
    'SELECT allowed FROM public.consume_account_deletion_attempt(%L, %L, %L)',
    :'rate_user', :'request_ip', :'test_agent'
  ),
  $$ VALUES (TRUE) $$,
  'allows the second deletion attempt'
);
SELECT results_eq(
  FORMAT(
    'SELECT allowed FROM public.consume_account_deletion_attempt(%L, %L, %L)',
    :'rate_user', :'request_ip', :'test_agent'
  ),
  $$ VALUES (TRUE) $$,
  'allows the third deletion attempt'
);
SELECT results_eq(
  FORMAT(
    'SELECT allowed FROM public.consume_account_deletion_attempt(%L, %L, %L)',
    :'rate_user', :'request_ip', :'test_agent'
  ),
  $$ VALUES (FALSE) $$,
  'rejects a fourth deletion attempt in the same minute'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.account_deletion_attempts
    WHERE user_id = :'rate_user'
  ),
  3,
  'records only allowed deletion attempts'
);

SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, TRUE)', :'job_user'),
  $$ VALUES (TRUE) $$,
  'creates and claims a missing deletion job'
);
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, TRUE)', :'job_user'),
  $$ VALUES (FALSE) $$,
  'does not claim a job with an active lease twice'
);

UPDATE public.account_deletion_jobs
SET status = 'failed', next_run_at = NOW() + INTERVAL '1 minute'
WHERE user_id = :'job_user';
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, FALSE)', :'job_user'),
  $$ VALUES (FALSE) $$,
  'does not claim a failed job before its retry time'
);

UPDATE public.account_deletion_jobs
SET next_run_at = NOW() - INTERVAL '1 second'
WHERE user_id = :'job_user';
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, FALSE)', :'job_user'),
  $$ VALUES (TRUE) $$,
  'claims a failed job after its retry time'
);

UPDATE public.account_deletion_jobs
SET status = 'in_progress', updated_at = NOW() - INTERVAL '16 minutes'
WHERE user_id = :'job_user';
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, FALSE)', :'job_user'),
  $$ VALUES (TRUE) $$,
  'recovers a deletion job after its lease expires'
);

UPDATE public.account_deletion_jobs
SET status = 'dead_lettered', attempts = 5, dead_lettered_at = NOW()
WHERE user_id = :'job_user';
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, FALSE)', :'job_user'),
  $$ VALUES (FALSE) $$,
  'the reconciler cannot revive a dead-lettered job'
);
SELECT results_eq(
  FORMAT('SELECT claimed FROM public.claim_account_deletion_job(%L, TRUE)', :'job_user'),
  $$ VALUES (TRUE) $$,
  'an explicit user request revives a dead-lettered job'
);
SELECT is(
  (
    SELECT attempts
    FROM public.account_deletion_jobs
    WHERE user_id = :'job_user'
  ),
  0,
  'reviving a dead-lettered job resets its attempt budget'
);

CREATE TEMP TABLE first_claim AS
SELECT claim_token
FROM public.claim_account_deletion_job(
  :'fence_user',
  TRUE
);
UPDATE public.account_deletion_jobs
SET updated_at = NOW() - INTERVAL '16 minutes'
WHERE user_id = :'fence_user';
CREATE TEMP TABLE second_claim AS
SELECT claim_token
FROM public.claim_account_deletion_job(
  :'fence_user',
  FALSE
);
SELECT isnt(
  (SELECT claim_token FROM first_claim),
  (SELECT claim_token FROM second_claim),
  'reclaiming stale work rotates the fencing token'
);
CREATE TEMP TABLE stale_update_result AS
WITH stale_update AS (
  UPDATE public.account_deletion_jobs
  SET status = 'completed'
  WHERE user_id = :'fence_user'
    AND claim_token = (SELECT claim_token FROM first_claim)
  RETURNING 1
)
SELECT COUNT(*)::INTEGER AS updated_rows FROM stale_update;
SELECT is(
  (SELECT updated_rows FROM stale_update_result),
  0,
  'a stale fencing token cannot update reclaimed work'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.consume_account_deletion_attempt(uuid,text,text)',
    :'execute_privilege'
  ),
  'anonymous callers cannot consume deletion attempts'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_account_deletion_job(uuid,boolean)',
    :'execute_privilege'
  ),
  'authenticated callers cannot claim deletion jobs'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_account_deletion_job(uuid,boolean)',
    :'execute_privilege'
  ),
  'the service role can claim deletion jobs'
);

SELECT * FROM finish();

ROLLBACK;
