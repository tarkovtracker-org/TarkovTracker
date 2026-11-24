BEGIN;
SELECT plan(25);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000601', 'handle-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000602', 'handle-other@example.invalid');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';

SELECT lives_ok($$INSERT INTO public.profile_handles (handle) VALUES ('rat_one')$$,
  'an account can claim a valid handle');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle) VALUES ('rat_two')$$,
  '23505', NULL, 'each account can only claim one handle');
SELECT throws_ok($$UPDATE public.profile_handles SET renamed_at = NULL$$,
  '42501', NULL, 'clients cannot write the cooldown timestamp');
SELECT throws_ok($$INSERT INTO public.profile_handles (handle, renamed_at) VALUES ('rat_two', NULL)$$,
  '42501', NULL, 'clients cannot supply the cooldown timestamp when claiming');
SELECT throws_ok($$UPDATE public.profile_handles SET user_id = NULL$$,
  '42501', NULL, 'clients cannot transfer ownership');
SELECT throws_ok($$DELETE FROM public.profile_handles$$,
  '42501', NULL, 'clients cannot delete and reclaim to bypass the cooldown');

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
WITH renamed AS (
  UPDATE public.profile_handles SET handle = 'rat_two' WHERE handle = 'rat_one' RETURNING handle
)
SELECT is((SELECT count(*) FROM renamed), 0::bigint, 'other accounts cannot rename a claim');
SELECT lives_ok($$INSERT INTO public.profile_handles (handle) VALUES ('other_rat')$$,
  'a second account can claim its own handle');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'other_rat'$$,
  '23505', NULL, 'a rename cannot take another account’s active handle');
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'Rat_Two'$$,
  '23514', NULL, 'renames enforce canonical lowercase');
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'admin_2'$$,
  '23514', NULL, 'renames enforce the reserved list');
SELECT lives_ok($$UPDATE public.profile_handles SET handle = 'rat_one'$$,
  'saving the same handle does not use up the first rename');
SELECT lives_ok($$UPDATE public.profile_handles SET handle = 'rat_two'$$,
  'an existing account can rename immediately after claiming');
SELECT is((SELECT handle FROM public.profile_handles), 'rat_two',
  'only the active handle is associated with the owner');
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'rat_three'$$,
  'PT429', NULL, 'a second rename is rejected during the cooldown');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000602';
SELECT lives_ok($$UPDATE public.profile_handles SET handle = 'rat_one'$$,
  'another account can immediately acquire the previous handle');

RESET ROLE;
UPDATE public.profile_handles SET renamed_at = now() - interval '720 hours' WHERE handle = 'rat_two';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';
SELECT lives_ok($$UPDATE public.profile_handles SET handle = 'rat_three'$$,
  'the owner can rename again after 30 days');

RESET ROLE;
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000601';
SELECT ok(EXISTS (SELECT FROM public.profile_handles WHERE handle = 'rat_three' AND user_id IS NULL),
  'a deleted account releases its identity while reserving the old address');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT handle FROM public.profile_handles$$, '42501', NULL,
  'anonymous clients cannot enumerate claimed handles');
SELECT throws_ok($$UPDATE public.profile_handles SET handle = 'rat_four'$$, '42501', NULL,
  'anonymous clients cannot rename handles');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
