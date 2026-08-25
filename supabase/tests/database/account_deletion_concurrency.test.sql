BEGIN;

SELECT plan(13);

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000718', 'account-delete-718@example.invalid'),
  ('00000000-0000-0000-0000-000000000719', 'account-delete-719@example.invalid');

SELECT results_eq(
  $$ SELECT allowed FROM public.consume_account_deletion_attempt(
    '00000000-0000-0000-0000-000000000718', '127.0.0.1', 'pgTAP'
  ) $$,
  $$ VALUES (TRUE) $$,
  'allows the first deletion attempt'
);
SELECT results_eq(
  $$ SELECT allowed FROM public.consume_account_deletion_attempt(
    '00000000-0000-0000-0000-000000000718', '127.0.0.1', 'pgTAP'
  ) $$,
  $$ VALUES (TRUE) $$,
  'allows the second deletion attempt'
);
SELECT results_eq(
  $$ SELECT allowed FROM public.consume_account_deletion_attempt(
    '00000000-0000-0000-0000-000000000718', '127.0.0.1', 'pgTAP'
  ) $$,
  $$ VALUES (TRUE) $$,
  'allows the third deletion attempt'
);
SELECT results_eq(
  $$ SELECT allowed FROM public.consume_account_deletion_attempt(
    '00000000-0000-0000-0000-000000000718', '127.0.0.1', 'pgTAP'
  ) $$,
  $$ VALUES (FALSE) $$,
  'rejects a fourth deletion attempt in the same minute'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.account_deletion_attempts
    WHERE user_id = '00000000-0000-0000-0000-000000000718'
  ),
  3,
  'records only allowed deletion attempts'
);

SELECT results_eq(
  $$ SELECT claimed FROM public.claim_account_deletion_job(
    '00000000-0000-0000-0000-000000000719', TRUE
  ) $$,
  $$ VALUES (TRUE) $$,
  'creates and claims a missing deletion job'
);
SELECT results_eq(
  $$ SELECT claimed FROM public.claim_account_deletion_job(
    '00000000-0000-0000-0000-000000000719', TRUE
  ) $$,
  $$ VALUES (FALSE) $$,
  'does not claim a job with an active lease twice'
);

UPDATE public.account_deletion_jobs
SET status = 'failed', next_run_at = NOW() + INTERVAL '1 minute'
WHERE user_id = '00000000-0000-0000-0000-000000000719';
SELECT results_eq(
  $$ SELECT claimed FROM public.claim_account_deletion_job(
    '00000000-0000-0000-0000-000000000719', FALSE
  ) $$,
  $$ VALUES (FALSE) $$,
  'does not claim a failed job before its retry time'
);

UPDATE public.account_deletion_jobs
SET next_run_at = NOW() - INTERVAL '1 second'
WHERE user_id = '00000000-0000-0000-0000-000000000719';
SELECT results_eq(
  $$ SELECT claimed FROM public.claim_account_deletion_job(
    '00000000-0000-0000-0000-000000000719', FALSE
  ) $$,
  $$ VALUES (TRUE) $$,
  'claims a failed job after its retry time'
);

UPDATE public.account_deletion_jobs
SET status = 'in_progress', updated_at = NOW() - INTERVAL '16 minutes'
WHERE user_id = '00000000-0000-0000-0000-000000000719';
SELECT results_eq(
  $$ SELECT claimed FROM public.claim_account_deletion_job(
    '00000000-0000-0000-0000-000000000719', FALSE
  ) $$,
  $$ VALUES (TRUE) $$,
  'recovers a deletion job after its lease expires'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.consume_account_deletion_attempt(uuid,text,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot consume deletion attempts'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_account_deletion_job(uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated callers cannot claim deletion jobs'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_account_deletion_job(uuid,boolean)',
    'EXECUTE'
  ),
  'the service role can claim deletion jobs'
);

SELECT * FROM finish();

ROLLBACK;
