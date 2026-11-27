BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000691', 'modifier-plan-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000692', 'modifier-plan-other@example.invalid');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.season_two_modifier_plans$$, '42501', NULL,
  'signed-out browsers cannot read account plans');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000691';

SELECT is((SELECT count(*) FROM public.season_two_modifier_plans), 0::bigint,
  'a new account has no plan');
SELECT lives_ok($$
  INSERT INTO public.season_two_modifier_plans (user_id, modifier_ids)
  VALUES ('00000000-0000-4000-8000-000000000691', ARRAY['preview:untar-control:prodigy'])
  ON CONFLICT (user_id) DO NOTHING
$$, 'the account can insert a plan from its first browser');
SELECT lives_ok($$
  INSERT INTO public.season_two_modifier_plans (user_id, modifier_ids)
  VALUES ('00000000-0000-4000-8000-000000000691', '{}'::text[])
  ON CONFLICT (user_id) DO UPDATE
    SET user_id = excluded.user_id, modifier_ids = excluded.modifier_ids
$$, 'the account can upsert an explicitly empty plan');
SELECT lives_ok($$
  INSERT INTO public.season_two_modifier_plans (user_id, modifier_ids)
  VALUES ('00000000-0000-4000-8000-000000000691', ARRAY['preview:untar-control:deadline'])
  ON CONFLICT (user_id) DO NOTHING
$$, 'a concurrent guest import skips an existing plan');
SELECT is((SELECT modifier_ids FROM public.season_two_modifier_plans), '{}'::text[],
  'another browser can read the cleared plan and its guest import did not replace it');
SELECT throws_ok($$UPDATE public.season_two_modifier_plans SET modifier_ids = array_fill('x'::text, ARRAY[257])$$,
  '23514', NULL, 'the server rejects oversized plans');
SELECT throws_ok($$UPDATE public.season_two_modifier_plans SET modifier_ids = ARRAY[repeat('x', 65537)]$$,
  '23514', NULL, 'the server bounds the stored byte count');
SELECT throws_ok($$UPDATE public.season_two_modifier_plans SET modifier_ids = ARRAY[['x'], ['y']]$$,
  '23514', NULL, 'the server rejects nested selections');
SELECT throws_ok($$UPDATE public.season_two_modifier_plans SET modifier_ids = ARRAY[NULL]::text[]$$,
  '23514', NULL, 'the server rejects null ids');
SELECT throws_ok($$DELETE FROM public.season_two_modifier_plans$$, '42501', NULL,
  'client deletion cannot remove the cleared-plan marker');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000692';
SELECT is((SELECT count(*) FROM public.season_two_modifier_plans), 0::bigint,
  'other accounts cannot see the owner plan');
WITH changed AS (
  UPDATE public.season_two_modifier_plans SET modifier_ids = ARRAY['other'] RETURNING user_id
)
SELECT is((SELECT count(*) FROM changed), 0::bigint, 'other accounts cannot update the owner plan');
SELECT throws_ok($$
  INSERT INTO public.season_two_modifier_plans (user_id, modifier_ids)
  VALUES ('00000000-0000-4000-8000-000000000691', ARRAY['other'])
  ON CONFLICT (user_id) DO UPDATE SET modifier_ids = excluded.modifier_ids
$$, '42501', NULL, 'other accounts cannot overwrite the owner plan by upsert');

RESET ROLE;
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000691';
SELECT is((SELECT count(*) FROM public.season_two_modifier_plans), 0::bigint,
  'deleting the account deletes its plan');
SELECT * FROM finish();
ROLLBACK;
