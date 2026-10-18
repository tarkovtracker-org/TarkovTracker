BEGIN;
SELECT plan(20);

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_attribute
  WHERE attrelid = 'public.user_preferences'::regclass
    AND attname = column_name AND attnum > 0 AND NOT attisdropped
), 'retired preference is absent: ' || column_name)
FROM unnest(ARRAY[
  'hideout_sort_ready_first', 'hideout_collapse_completed', 'task_card_density',
  'show_task_ids', 'show_not_required_labels', 'enable_holiday_effects', 'neededitems_style'
]) AS column_name;

SELECT is((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.user_preferences'::regclass),
  4::bigint, 'preference ownership policies remain present');
SELECT is(ARRAY(SELECT tgname::text FROM pg_trigger
  WHERE tgrelid = 'public.user_preferences'::regclass AND NOT tgisinternal ORDER BY tgname),
  ARRAY['retain_preferences_activity', 'set_user_preferences_updated_at', 'sync_legacy_profile_share_visibility'],
  'activity, timestamp and legacy visibility triggers remain present');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_preferences'::regclass),
  'preference RLS remains enabled');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000012230', 'retired-preferences@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012230', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.user_preferences (user_id, streamer_mode)
  VALUES ('00000000-0000-0000-0000-000000012230', true)
  ON CONFLICT (user_id) DO UPDATE SET streamer_mode = EXCLUDED.streamer_mode$$,
  'current preference upsert remains available to its owner');
SELECT lives_ok($$SELECT * FROM public.user_preferences
  WHERE user_id = '00000000-0000-0000-0000-000000012230'$$,
  'select-star clients still read the retained row');
SELECT is((SELECT streamer_mode FROM public.user_preferences
  WHERE user_id = '00000000-0000-0000-0000-000000012230'), true,
  'retained preference values survive current upsert');
SELECT throws_ok(format('UPDATE public.user_preferences SET %I = NULL', column_name),
  '42703', NULL, 'stale SQL must reject retired column before client fallback: ' || column_name)
FROM unnest(ARRAY[
  'hideout_sort_ready_first', 'hideout_collapse_completed', 'task_card_density',
  'show_task_ids', 'show_not_required_labels', 'enable_holiday_effects', 'neededitems_style'
]) AS column_name;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
