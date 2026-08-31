BEGIN;

SELECT plan(18);

CREATE TEMP TABLE deletion_test_fixture AS
SELECT
  '00000000-0000-0000-0000-000000000718'::UUID AS rate_user,
  '00000000-0000-0000-0000-000000000719'::UUID AS job_user,
  '00000000-0000-0000-0000-000000000720'::UUID AS fence_user,
  '127.0.0.1'::TEXT AS request_ip,
  'pgTAP'::TEXT AS test_agent,
  'EXECUTE'::TEXT AS execute_privilege;

INSERT INTO auth.users (id, email)
VALUES
  ((SELECT rate_user FROM deletion_test_fixture), 'account-delete-718@example.invalid'),
  ((SELECT job_user FROM deletion_test_fixture), 'account-delete-719@example.invalid'),
  ((SELECT fence_user FROM deletion_test_fixture), 'account-delete-720@example.invalid');

CREATE FUNCTION pg_temp.consume_test_attempt()
RETURNS BOOLEAN
LANGUAGE SQL
AS $$
  SELECT allowed
  FROM public.consume_account_deletion_attempt(
    (SELECT rate_user FROM deletion_test_fixture),
    (SELECT request_ip FROM deletion_test_fixture),
    (SELECT test_agent FROM deletion_test_fixture)
  );
$$;

SELECT is(
  pg_temp.consume_test_attempt(),
  TRUE,
  'allows the first deletion attempt'
);
SELECT is(
  pg_temp.consume_test_attempt(),
  TRUE,
  'allows the second deletion attempt'
);
SELECT is(
  pg_temp.consume_test_attempt(),
  TRUE,
  'allows the third deletion attempt'
);
SELECT is(
  pg_temp.consume_test_attempt(),
  FALSE,
  'rejects a fourth deletion attempt in the same minute'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.account_deletion_attempts
    WHERE user_id = (SELECT rate_user FROM deletion_test_fixture)
  ),
  3,
  'records only allowed deletion attempts'
);

SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), TRUE
  )),
  TRUE,
  'creates and claims a missing deletion job'
);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), TRUE
  )),
  FALSE,
  'does not claim a job with an active lease twice'
);

UPDATE public.account_deletion_jobs
SET status = 'failed', next_run_at = NOW() + INTERVAL '1 minute'
WHERE user_id = (SELECT job_user FROM deletion_test_fixture);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), FALSE
  )),
  FALSE,
  'does not claim a failed job before its retry time'
);

UPDATE public.account_deletion_jobs
SET next_run_at = NOW() - INTERVAL '1 second'
WHERE user_id = (SELECT job_user FROM deletion_test_fixture);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), FALSE
  )),
  TRUE,
  'claims a failed job after its retry time'
);

UPDATE public.account_deletion_jobs
SET status = 'in_progress', updated_at = NOW() - INTERVAL '16 minutes'
WHERE user_id = (SELECT job_user FROM deletion_test_fixture);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), FALSE
  )),
  TRUE,
  'recovers a deletion job after its lease expires'
);

UPDATE public.account_deletion_jobs
SET status = 'dead_lettered', attempts = 5, dead_lettered_at = NOW()
WHERE user_id = (SELECT job_user FROM deletion_test_fixture);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), FALSE
  )),
  FALSE,
  'the reconciler cannot revive a dead-lettered job'
);
SELECT is(
  (SELECT claimed FROM public.claim_account_deletion_job(
    (SELECT job_user FROM deletion_test_fixture), TRUE
  )),
  TRUE,
  'an explicit user request revives a dead-lettered job'
);
SELECT is(
  (
    SELECT attempts
    FROM public.account_deletion_jobs
    WHERE user_id = (SELECT job_user FROM deletion_test_fixture)
  ),
  0,
  'reviving a dead-lettered job resets its attempt budget'
);

CREATE TEMP TABLE first_claim AS
SELECT claim_token
FROM public.claim_account_deletion_job(
  (SELECT fence_user FROM deletion_test_fixture),
  TRUE
);
UPDATE public.account_deletion_jobs
SET updated_at = NOW() - INTERVAL '16 minutes'
WHERE user_id = (SELECT fence_user FROM deletion_test_fixture);
CREATE TEMP TABLE second_claim AS
SELECT claim_token
FROM public.claim_account_deletion_job(
  (SELECT fence_user FROM deletion_test_fixture),
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
  WHERE user_id = (SELECT fence_user FROM deletion_test_fixture)
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
    (SELECT execute_privilege FROM deletion_test_fixture)
  ),
  'anonymous callers cannot consume deletion attempts'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_account_deletion_job(uuid,boolean)',
    (SELECT execute_privilege FROM deletion_test_fixture)
  ),
  'authenticated callers cannot claim deletion jobs'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_account_deletion_job(uuid,boolean)',
    (SELECT execute_privilege FROM deletion_test_fixture)
  ),
  'the service role can claim deletion jobs'
);

SELECT * FROM finish();

ROLLBACK;
