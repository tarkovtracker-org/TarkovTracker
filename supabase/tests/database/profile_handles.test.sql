BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000601', 'handle-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000602', 'handle-other@example.invalid');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';

SELECT lives_ok($$INSERT INTO public.profile_handles (handle) VALUES ('rat_one')$$,
  'an account can claim a valid handle');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle) VALUES ('rat_two')$$,
  '23505', NULL, 'each account can only claim one handle');
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'rat_two'$$,
  '42501', NULL, 'clients cannot rename a claim');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000602';

SELECT is((SELECT count(*) FROM public.profile_handles), 0::bigint,
  'other accounts cannot read a claim');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle) VALUES ('rat_one')$$,
  '23505', NULL, 'two accounts cannot share a handle');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle) VALUES ('Rat_One')$$,
  '23514', NULL, 'the database enforces canonical lowercase');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle) VALUES ('admin_2')$$,
  '23514', NULL, 'the database enforces the reserved list');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle, user_id)
  VALUES ('rat_two', '00000000-0000-4000-8000-000000000601')$$,
  '42501', NULL, 'an account cannot claim a handle for a different account');

RESET ROLE;
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000601';
SELECT ok(EXISTS (SELECT FROM public.profile_handles WHERE handle = 'rat_one' AND user_id IS NULL),
  'a deleted account releases its identity while reserving the old address');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT handle FROM public.profile_handles$$, '42501', NULL,
  'anonymous clients cannot enumerate claimed handles');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
