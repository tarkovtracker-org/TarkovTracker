BEGIN;
SELECT plan(54);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000001001', 'profiles-supporter@example.invalid'),
  ('00000000-0000-0000-0000-000000001002', 'profiles-other@example.invalid'),
  ('00000000-0000-0000-0000-000000001003', 'profiles-plain@example.invalid'),
  ('00000000-0000-0000-0000-000000001004', 'profiles-disqualified@example.invalid');

INSERT INTO public.supporters (user_id, type, status, expires_at) VALUES
  ('00000000-0000-0000-0000-000000001001', 'subscription', 'active', NULL),
  ('00000000-0000-0000-0000-000000001002', 'subscription', 'active', NULL);
INSERT INTO public.supporters (user_id, type, status, expires_at, supporter_disqualified_at) VALUES
  ('00000000-0000-0000-0000-000000001004', 'subscription', 'active', NULL, now());

CREATE TEMP TABLE profile_ids (label text PRIMARY KEY, id uuid);
GRANT ALL ON profile_ids TO authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
SELECT is(public.list_game_profiles(),
  '{"profiles":[],"max_profiles":2,"unlocked":false,"can_add":false}'::jsonb,
  'a plain account has no profiles and cannot add one');
SELECT throws_ok($$SELECT public.add_game_profile('Alt', '2222')$$,
  'PT403', 'Game profiles require supporter access', 'a non-supporter cannot add a profile');
SELECT lives_ok($$SELECT public.update_game_profile(NULL, NULL, '9999')$$,
  'a non-supporter can still bind the default profile to its EFT account');
SELECT is((SELECT count(*)::int FROM public.user_game_profiles
  WHERE user_id = '00000000-0000-0000-0000-000000001003' AND is_default), 1,
  'binding creates the default profile row lazily');
SELECT is(public.list_game_profiles()->'can_add', 'false'::jsonb,
  'a bound default profile does not unlock adding');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
SELECT is(public.list_game_profiles()->'can_add', 'true'::jsonb,
  'a supporter with no profile rows can add');
SELECT is((SELECT count(*)::int FROM public.user_game_profiles
  WHERE user_id = '00000000-0000-0000-0000-000000001001'), 0,
  'listing does not create rows');
SELECT public.update_game_profile(NULL, 'Main', '1111');
INSERT INTO profile_ids
SELECT 'alt', (public.add_game_profile('Alt', '2222')->'profile'->>'id')::uuid;
SELECT is((SELECT count(*)::int FROM public.user_game_profiles
  WHERE user_id = '00000000-0000-0000-0000-000000001001'), 2,
  'a supporter holds the default and one extra profile');
SELECT is(public.list_game_profiles()->'can_add', 'false'::jsonb,
  'the cap of two profiles closes adding');
SELECT throws_ok($$SELECT public.add_game_profile('Third', '3333')$$,
  'PT422', 'Game profile limit reached', 'a third profile is rejected');
SELECT throws_ok($$SELECT public.update_game_profile(NULL, NULL, '2222')$$,
  'PT409', 'Game profile already exists for this account', 'one profile per EFT account id');
SELECT throws_ok($$SELECT public.update_game_profile(NULL, repeat('x', 41), NULL)$$,
  'PT400', 'Invalid game profile label or EFT account id', 'an over-long label is rejected');
SELECT throws_ok($$SELECT public.update_game_profile(NULL, NULL, '12 34')$$,
  'PT400', 'Invalid game profile label or EFT account id', 'a malformed EFT account id is rejected');
SELECT is((SELECT jsonb_path_query_array(public.list_game_profiles()->'profiles', '$[*].is_default')),
  '[true, false]'::jsonb, 'the default profile is listed first');

CREATE TEMP TABLE default_counts AS SELECT
  (SELECT count(*)::int FROM public.user_game_mode_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001001') AS modes,
  (SELECT count(*)::int FROM public.user_progress
    WHERE user_id = '00000000-0000-0000-0000-000000001001') AS progress;
SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'), 2,
  '{"pvp":{"level":8},"pve":{"level":3}}', NULL);
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'pvp'), '8',
  'the extra profile stores its own progress');
SELECT is((SELECT count(*)::int FROM public.user_game_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001001'), (SELECT modes FROM default_counts),
  'the extra profile never writes the default progress tables');
SELECT is((SELECT count(*)::int FROM public.user_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001001'), (SELECT progress FROM default_counts),
  'the extra profile never writes user_progress');
SELECT is(jsonb_array_length(public.get_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'))->'modes'), 2,
  'the extra profile''s progress is readable');
SELECT throws_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM public.user_game_profiles
    WHERE user_id = '00000000-0000-0000-0000-000000001001' AND is_default),
  1, '{"pvp":{"level":1}}', NULL)$$,
  'PT409', 'The default game profile uses the standard progress sync',
  'the default profile cannot be written through the extra-profile sync');
SELECT throws_ok(format($$SELECT public.sync_game_profile_progress(%L, 1, '{"duo":{}}', NULL)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'P0001', 'Unsupported game mode: duo', 'unknown modes are rejected');
SELECT throws_ok($$SELECT public.delete_game_profile(
  (SELECT id FROM public.user_game_profiles
    WHERE user_id = '00000000-0000-0000-0000-000000001001' AND is_default))$$,
  'PT409', 'The default game profile cannot be deleted', 'the default profile cannot be deleted');

SELECT set_config('test.profile_active_season', private.active_season_number()::text, true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'), 2,
  '{"seasonal":{"level":14}}', current_setting('test.profile_active_season')::SMALLINT)$$,
  'an authenticated client saves the matching Seasonal season');
RESET ROLE;
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt')
    AND game_mode = 'seasonal' AND season_number = private.active_season_number()), '14',
  'matching Seasonal progress is stored under the active season');
CREATE TEMP TABLE profile_season_history AS
SELECT to_jsonb(progress) AS saved_row
FROM public.user_profile_mode_progress progress
WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'seasonal';

-- Roll over inside this transaction so the saved season becomes historical.
SELECT set_config('test.profile_active_season', (private.active_season_number() + 1)::text, true);
CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT current_setting('test.profile_active_season')::SMALLINT; $$;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'), 2,
  '{"seasonal":{"level":22}}', current_setting('test.profile_active_season')::SMALLINT)$$,
  'an authenticated client saves after a Seasonal rollover');
RESET ROLE;
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt')
    AND game_mode = 'seasonal' AND season_number = private.active_season_number()), '22',
  'a rollover writes the new active season');
SELECT is((SELECT count(*)::int FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'seasonal'), 2,
  'a rollover retains both seasons');
SELECT is((SELECT to_jsonb(progress) FROM public.user_profile_mode_progress progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt')
    AND game_mode = 'seasonal' AND season_number = private.active_season_number() - 1),
  (SELECT saved_row FROM profile_season_history), 'a rollover leaves the historical row unchanged');
CREATE TEMP TABLE profile_season_snapshot AS
SELECT jsonb_agg(to_jsonb(progress) ORDER BY season_number) AS saved_rows
FROM public.user_profile_mode_progress progress
WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'seasonal';

SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'), 2,
  '{"pvp":{"level":12},"seasonal":{"level":99}}',
  (current_setting('test.profile_active_season')::SMALLINT - 1)::SMALLINT)$$,
  'a stale season does not abort valid persistent-mode changes');
RESET ROLE;
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'pvp'), '12',
  'a stale season still commits PvP progress');
SELECT is((SELECT jsonb_agg(to_jsonb(progress) ORDER BY season_number)
  FROM public.user_profile_mode_progress progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'seasonal'),
  (SELECT saved_rows FROM profile_season_snapshot), 'a stale season preserves all Seasonal rows');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'alt'), 2,
  '{"pvp":{"level":13},"seasonal":{"level":98}}')$$,
  'a missing season does not abort valid persistent-mode changes');
RESET ROLE;
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'pvp'), '13',
  'a missing season still commits PvP progress');
SELECT is((SELECT jsonb_agg(to_jsonb(progress) ORDER BY season_number)
  FROM public.user_profile_mode_progress progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'seasonal'),
  (SELECT saved_rows FROM profile_season_snapshot), 'a missing season preserves all Seasonal rows');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
SELECT throws_ok(format($$SELECT public.get_game_profile_progress(%L)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'PT404', 'Game profile not found', 'an account cannot read another account''s profile');
SELECT throws_ok(format($$SELECT public.delete_game_profile(%L)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'PT404', 'Game profile not found', 'an account cannot delete another account''s profile');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
UPDATE public.supporters SET status = 'expired'
WHERE user_id = '00000000-0000-0000-0000-000000001001';
SELECT throws_ok(format($$SELECT public.sync_game_profile_progress(%L, 2, '{"pvp":{"level":9}}', NULL)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'PT403', 'Game profiles require supporter access', 'a lapsed supporter''s extra profile is read-only');
SELECT is((SELECT progress_data->>'level' FROM public.user_profile_mode_progress
  WHERE profile_id = (SELECT id FROM profile_ids WHERE label = 'alt') AND game_mode = 'pvp'), '13',
  'a lapsed supporter keeps the stored progress');
SELECT lives_ok(format($$SELECT public.get_game_profile_progress(%L)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'a lapsed supporter can still read the extra profile');

INSERT INTO public.app_settings (key, value) VALUES ('game_profiles_access', '"all"');
SELECT lives_ok(format($$SELECT public.sync_game_profile_progress(%L, 2, '{"pvp":{"level":9}}', NULL)$$,
  (SELECT id FROM profile_ids WHERE label = 'alt')),
  'the access setting "all" opens writes to non-supporters');
DELETE FROM public.app_settings WHERE key = 'game_profiles_access';

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
SELECT is(public.list_game_profiles()->'unlocked', 'false'::jsonb,
  'a disqualified supporter does not unlock profiles');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
SELECT public.delete_game_profile((SELECT id FROM profile_ids WHERE label = 'alt'));
SELECT is((SELECT count(*)::int FROM public.user_profile_mode_progress
  WHERE user_id = '00000000-0000-0000-0000-000000001001'), 0,
  'a lapsed supporter can delete the profile and its progress goes with it');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
SET LOCAL ROLE authenticated;
SELECT is(public.list_game_profiles()->'can_add', 'true'::jsonb,
  'an authenticated client can list its profiles');
SELECT lives_ok($$SELECT public.update_game_profile(NULL, NULL, '4444')$$,
  'an authenticated client can bind the default profile with nullable inputs');
SELECT lives_ok($$INSERT INTO profile_ids
  SELECT 'client-alt', (public.add_game_profile(NULL, NULL)->'profile'->>'id')::uuid$$,
  'an authenticated client can add an unbound profile');
SELECT is(public.update_game_profile((SELECT id FROM profile_ids WHERE label = 'client-alt'),
  'Client alt', '5555')->'profile'->>'label', 'Client alt',
  'an authenticated client can update its extra profile');
SELECT lives_ok($$SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'), NULL, '{"pvp":{"level":7}}', NULL)$$,
  'an authenticated client can sync with nullable edition and season inputs');
SELECT is(jsonb_array_length(public.get_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'))->'modes'), 1,
  'an authenticated client can read its extra profile progress');
SELECT is(public.get_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'))->'game_edition', 'null'::jsonb,
  'a null edition remains unset');
SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'), 2, '{}', NULL);
SELECT is(public.get_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'))->'game_edition', '2'::jsonb,
  'an explicit edition is saved');
SELECT public.sync_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'), NULL, '{"pvp":{"level":8}}', NULL);
SELECT is(public.get_game_profile_progress(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'))->'game_edition', '2'::jsonb,
  'a nullable progress sync preserves the previously saved edition');
SELECT lives_ok($$SELECT public.delete_game_profile(
  (SELECT id FROM profile_ids WHERE label = 'client-alt'))$$,
  'an authenticated client can delete its extra profile');
SELECT is(jsonb_array_length(public.list_game_profiles()->'profiles'), 1,
  'authenticated deletion leaves the default profile');
SELECT throws_ok($$SELECT * FROM public.user_profile_mode_progress$$, '42501',
  'permission denied for table user_profile_mode_progress',
  'clients cannot read profile progress directly');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.add_game_profile(text, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.game_profiles_unlocked(uuid)', 'EXECUTE'),
  'anonymous callers and the gate helper are not exposed');

SELECT * FROM finish();
ROLLBACK;
