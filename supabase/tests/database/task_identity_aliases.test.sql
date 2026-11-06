BEGIN;
SELECT no_plan();
SELECT is(public.get_progress_task_id_aliases()->'modes'->'regular'->'tasks', '{}'::jsonb, 'deployment does not activate aliases');
SELECT ok(NOT has_function_privilege('anon', 'public.get_progress_task_id_aliases()', 'EXECUTE'), 'anonymous cannot read the service RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_progress_task_id_aliases()', 'EXECUTE'), 'browser cannot read the service RPC');
SELECT ok(NOT has_function_privilege('service_role', 'private.reconcile_task_identity_progress(jsonb,jsonb,text,jsonb)', 'EXECUTE'), 'service clients cannot supply trusted alias maps');
-- Same immutable fixtures exported by API candidate 31576d1 (contracts 0.1.3).
CREATE TEMP TABLE identity_fixture (manifest jsonb, cases jsonb);
INSERT INTO identity_fixture VALUES
('{"schemaVersion":1,"modes":{"regular":{"tasks":{"placeholder_honest_review":"6a764077161e4b45b101566e"},"objectives":{"placeholder_honest_review_obj01":{"id":"6a7640eeb85e5647f3dac115","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj02":{"id":"6a76410f25ea8c8932a05eed","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj03":{"id":"6a764120b9eb5ecab9aec9de","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj04":{"id":"6a859783f08a23e0f6b74c8d","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj05":{"id":"6ab4e58f00619535bdfb9623","taskId":"6a764077161e4b45b101566e"}}},"pve":{"tasks":{},"objectives":{}},"pvp-season":{"tasks":{"placeholder_honest_review":"6a764077161e4b45b101566e","placeholder_uninvited_guests_part_1":"6a4f528221e50974ab006f6f"},"objectives":{"placeholder_honest_review_obj01":{"id":"6a7640eeb85e5647f3dac115","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj02":{"id":"6a76410f25ea8c8932a05eed","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj03":{"id":"6a764120b9eb5ecab9aec9de","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj04":{"id":"6a859783f08a23e0f6b74c8d","taskId":"6a764077161e4b45b101566e"},"placeholder_honest_review_obj05":{"id":"6ab4e58f00619535bdfb9623","taskId":"6a764077161e4b45b101566e"},"placeholder_uninvited_guests_part_1_obj01":{"id":"6a4f536ffbc8e969860a978a","taskId":"6a4f528221e50974ab006f6f"},"placeholder_uninvited_guests_part_1_obj02":{"id":"6a4f53148e2f06e1c92b75c7","taskId":"6a4f528221e50974ab006f6f"},"placeholder_uninvited_guests_part_1_obj03":{"id":"6a4f5328e3a7faef5677bea9","taskId":"6a4f528221e50974ab006f6f"},"placeholder_uninvited_guests_part_1_obj04":{"id":"6a4f53390f29680782fdf8d9","taskId":"6a4f528221e50974ab006f6f"},"placeholder_uninvited_guests_part_1_obj05":{"id":"6a4f54cffbc043d36ba11ae2","taskId":"6a4f528221e50974ab006f6f"}}}}}'::jsonb, '[{"name":"newer canonical uncheck","mode":"pvp","current":{"taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":10},"6a764077161e4b45b101566e":{"complete":false,"timestamp":20}}},"previous":{},"expected":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false,"timestamp":20}}}},{"name":"canonical without clock","mode":"pvp","current":{"taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":10},"6a764077161e4b45b101566e":{"complete":false}}},"previous":{},"expected":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false}}}},{"name":"old client newer edit","mode":"pvp","current":{"taskCompletions":{"placeholder_honest_review":{"complete":false,"timestamp":30}}},"previous":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":true,"timestamp":20}}},"expected":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false,"timestamp":30}}}},{"name":"old client stale snapshot","mode":"seasonal","current":{"taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":10}},"taskObjectives":{"placeholder_honest_review_obj01":{"count":9,"timestamp":10}}},"previous":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false,"timestamp":20}},"taskObjectives":{"6a7640eeb85e5647f3dac115":{"count":0,"timestamp":20}}},"expected":{"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false,"timestamp":20}},"taskObjectives":{"6a7640eeb85e5647f3dac115":{"count":0,"timestamp":20}}}},{"name":"sparse objective update","mode":"pvp","current":{"taskObjectives":{"placeholder_honest_review_obj01":{"count":0,"timestamp":30}}},"previous":{"taskObjectives":{"6a7640eeb85e5647f3dac115":{"complete":true,"count":10,"timestamp":20}}},"expected":{"taskObjectives":{"6a7640eeb85e5647f3dac115":{"complete":true,"count":0,"timestamp":30}}}},{"name":"no inherited objective clock","mode":"pvp","current":{"taskObjectives":{"placeholder_honest_review_obj01":{"count":9,"complete":true,"timestamp":30},"6a7640eeb85e5647f3dac115":{"count":0}}},"previous":{},"expected":{"taskObjectives":{"6a7640eeb85e5647f3dac115":{"count":0,"complete":true}}}},{"name":"reset epoch isolation","mode":"pvp","current":{"progressEpoch":2,"taskCompletions":{}},"previous":{"progressEpoch":1,"taskCompletions":{"placeholder_honest_review":true}},"expected":{"progressEpoch":2,"taskCompletions":{}}},{"name":"no pve fallback","mode":"pve","current":{"taskCompletions":{"placeholder_honest_review":true}},"previous":{},"expected":{"taskCompletions":{"placeholder_honest_review":true}}},{"name":"retain unknown and metadata","mode":"pvp","current":{"level":42,"taskCompletions":{"placeholder_honest_review":true,"unknown":false},"taskAvailability":{"placeholder_honest_review":{"available":false}}},"previous":{},"expected":{"level":42,"taskCompletions":{"6a764077161e4b45b101566e":true,"unknown":false},"taskAvailability":{"6a764077161e4b45b101566e":{"available":false}}}}]'::jsonb);

SELECT is(private.reconcile_task_identity_progress(c->'current', c->'previous', c->>'mode', manifest),
  c->'expected', 'contracts parity: ' || (c->>'name'))
FROM identity_fixture, jsonb_array_elements(cases) c;
SELECT is(private.reconcile_task_identity_progress(c->'expected', '{}'::jsonb, c->>'mode', manifest),
  c->'expected', 'idempotence: ' || (c->>'name'))
FROM identity_fixture, jsonb_array_elements(cases) c;

-- Existing pre-cutover confirmations must not use duplicate slots during the bounded merge.
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000001320','alias-cap@example.invalid');
INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data)
SELECT '00000000-0000-0000-0000-000000001320','pvp',0,
  jsonb_build_object('level',1,'taskAvailability',
    (SELECT jsonb_object_agg('unrelated_' || n, jsonb_build_object('requirements','gate','timestamp',n)) FROM generate_series(1,999) n)
    || '{"placeholder_honest_review":{"requirements":"gate","timestamp":2000}}'::jsonb);

-- Activate fixtures only inside this rolled-back test, never in the migration.
DO $test$
DECLARE v_manifest jsonb;
BEGIN
  SELECT manifest INTO v_manifest FROM identity_fixture;
  EXECUTE format('CREATE OR REPLACE FUNCTION private.progress_task_id_aliases() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = %L AS %L',
    '', 'SELECT ' || quote_literal(v_manifest::text) || '::jsonb');
END;
$test$;
INSERT INTO auth.users(id, email) VALUES ('00000000-0000-0000-0000-000000001302', 'aliases@example.invalid');
INSERT INTO public.user_progress(user_id) VALUES ('00000000-0000-0000-0000-000000001302') ON CONFLICT DO NOTHING;
INSERT INTO public.user_game_mode_progress(user_id, game_mode, season_number, progress_data)
VALUES ('00000000-0000-0000-0000-000000001302', 'pvp', 0,
  '{"level":1,"taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":10}},"taskAvailability":{"placeholder_honest_review":{"requirements":"gate","timestamp":10},"unrelated":{"requirements":"other","timestamp":5}}}');
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a764077161e4b45b101566e":{"complete":true,"timestamp":10}}'::jsonb, 'fresh insert is canonical before transaction visibility');
SELECT is((SELECT progress_data->'taskAvailability' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a764077161e4b45b101566e":{"requirements":"gate","timestamp":10},"unrelated":{"requirements":"other","timestamp":5}}'::jsonb,
  'fresh insert and preparation keep only canonical availability plus unrelated confirmations');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001320', true);
SELECT public.sync_user_game_mode_progress('pvp',1,NULL,
  '{"pvp":{"level":1,"taskAvailability":{"6a764077161e4b45b101566e":{"requirements":"new gate","timestamp":3000}}}}',NULL);
SELECT is((SELECT jsonb_object_length FROM public.user_game_mode_progress,
  LATERAL (SELECT count(*)::int AS jsonb_object_length FROM jsonb_object_keys(progress_data->'taskAvailability')) entries
  WHERE user_id='00000000-0000-0000-0000-000000001320' AND game_mode='pvp'),1000,
  'bounded sync merge retains 999 unrelated confirmations and one canonical family');
SELECT ok((SELECT (progress_data->'taskAvailability') ? 'unrelated_1'
  AND NOT (progress_data->'taskAvailability') ? 'placeholder_honest_review'
  FROM public.user_game_mode_progress WHERE user_id='00000000-0000-0000-0000-000000001320' AND game_mode='pvp'),
  'alias duplicates cannot evict the oldest unrelated confirmation');
UPDATE public.user_game_mode_progress SET progress_data = jsonb_set(progress_data,'{taskAvailability}',
  '{"placeholder_honest_review":{"requirements":"newer gate","timestamp":4000}}')
WHERE user_id='00000000-0000-0000-0000-000000001320' AND game_mode='pvp';
SELECT is((SELECT progress_data->'taskAvailability'->'6a764077161e4b45b101566e' FROM public.user_game_mode_progress WHERE user_id='00000000-0000-0000-0000-000000001320' AND game_mode='pvp'),
  '{"requirements":"newer gate","timestamp":4000}'::jsonb, 'old client availability update resolves before preparation');
SELECT ok((SELECT NOT (progress_data->'taskAvailability') ? 'placeholder_honest_review' FROM public.user_game_mode_progress WHERE user_id='00000000-0000-0000-0000-000000001320' AND game_mode='pvp'),
  'preparation cannot recreate the retired availability key');
UPDATE public.user_game_mode_progress SET progress_data = '{"level":1,"taskCompletions":{"6a764077161e4b45b101566e":{"complete":false}}}'
WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp';
INSERT INTO public.user_game_mode_progress(user_id, game_mode, season_number, progress_data)
VALUES ('00000000-0000-0000-0000-000000001302', 'pvp', 0,
  '{"level":1,"taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":30}}}')
ON CONFLICT (user_id, game_mode, season_number) DO UPDATE SET progress_data=EXCLUDED.progress_data;
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a764077161e4b45b101566e":{"complete":false}}'::jsonb, 'upsert retains alias origin and preserves canonical unknown-clock uncheck');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001302', 'pvp_data',
  '{"placeholder_honest_review":{"complete":true,"timestamp":40}}', NULL, NULL);
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a764077161e4b45b101566e":{"complete":false}}'::jsonb, 'API RPC cannot resurrect the alias');
UPDATE public.user_game_mode_progress SET progress_data = jsonb_set(progress_data,'{taskObjectives}',
  '{"6a7640eeb85e5647f3dac115":{"complete":false,"count":3,"timestamp":20}}')
WHERE user_id='00000000-0000-0000-0000-000000001302' AND game_mode='pvp';
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001302','pvp_data',NULL,NULL,
  '{"taskObjectives":{"placeholder_honest_review_obj01":{"complete":true,"count":12,"timestamp":10}}}');
SELECT is((SELECT progress_data->'taskObjectives' FROM public.user_game_mode_progress WHERE user_id='00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a7640eeb85e5647f3dac115":{"complete":false,"count":3,"timestamp":20}}'::jsonb, 'raw p_set cannot bypass identity reconciliation');
SELECT public.merge_progress_data('00000000-0000-0000-0000-000000001302','pvp_data',NULL,
  '{"placeholder_honest_review_obj01":{"count":0,"timestamp":30}}',NULL);
SELECT is((SELECT progress_data->'taskObjectives' FROM public.user_game_mode_progress WHERE user_id='00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a7640eeb85e5647f3dac115":{"complete":false,"count":0,"timestamp":30}}'::jsonb, 'sparse API alias patch preserves omitted completion and lowers count');
UPDATE public.user_game_mode_progress SET progress_data = '{"level":1,"progressEpoch":"0","taskCompletions":{"placeholder_honest_review":{"complete":true,"timestamp":50}}}'
WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp';
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{"6a764077161e4b45b101566e":{"complete":false}}'::jsonb, 'effective reset epochs are compared before preserving stored evidence');
UPDATE public.user_game_mode_progress SET progress_data = '{"level":1,"progressEpoch":1,"taskCompletions":{}}'
WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp';
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_game_mode_progress WHERE user_id = '00000000-0000-0000-0000-000000001302' AND game_mode='pvp'),
  '{}'::jsonb, 'reset epoch does not resurrect old progress');
INSERT INTO public.user_game_profiles(id,user_id,label,is_default)
VALUES ('00000000-0000-0000-0000-000000001303','00000000-0000-0000-0000-000000001302','Alt',false);
INSERT INTO public.user_profile_mode_progress(profile_id,user_id,game_mode,season_number,progress_data)
VALUES ('00000000-0000-0000-0000-000000001303','00000000-0000-0000-0000-000000001302','seasonal',1,
  '{"level":1,"taskCompletions":{"placeholder_uninvited_guests_part_1":{"complete":true,"timestamp":20}}}');
UPDATE public.user_profile_mode_progress SET progress_data = '{"level":1,"taskCompletions":{"placeholder_uninvited_guests_part_1":{"complete":false,"timestamp":30}}}'
WHERE profile_id='00000000-0000-0000-0000-000000001303';
SELECT is((SELECT progress_data->'taskCompletions' FROM public.user_profile_mode_progress WHERE profile_id='00000000-0000-0000-0000-000000001303'),
  '{"6a4f528221e50974ab006f6f":{"complete":false,"timestamp":30}}'::jsonb, 'profile writes also canonicalize newer explicit edits');
SELECT * FROM finish();
ROLLBACK;
