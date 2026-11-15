BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000009401', 'stash-import-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000009402', 'stash-import-other@example.invalid'),
  ('00000000-0000-0000-0000-000000009403', 'stash-import-fresh@example.invalid'),
  ('00000000-0000-0000-0000-000000009404', 'stash-import-bounded-work@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009401', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL, '{"pvp":{
  "level":42,"progressEpoch":7,"manualActivityEpoch":3,
  "taskObjectives":{"task-a":{"count":1,"complete":false,"foundInRaid":true,"timestamp":9999999999999},
    "task-done":{"count":2,"complete":true,"timestamp":7}},
  "hideoutParts":{"part-a":{"count":4,"complete":true,"customFlag":"keep","timestamp":8}},
  "hideoutModules":{"module-a":{"complete":true,"timestamp":9}},
  "taskCompletions":{"quest-a":{"complete":true,"timestamp":10}},
  "taskAvailability":{"quest-b":{"status":"available","timestamp":11}},
  "skills":{"Endurance":3},"storyChapters":{"chapter-a":{"complete":true}},
  "manualActivityHistory":[],"apiUpdateHistory":[]},"pve":{"level":5},"seasonal":{"level":6}}',
  private.active_season_number());
SELECT set_config('test.stash_import_active_season',private.active_season_number()::text,true);

CREATE FUNCTION pg_temp.stash_progress(p_mode text DEFAULT 'pvp') RETURNS jsonb
LANGUAGE sql AS $$ SELECT progress_data FROM public.user_game_mode_progress
  WHERE user_id = auth.uid() AND game_mode = p_mode
    AND season_number = CASE WHEN p_mode = 'seasonal'
      THEN current_setting('test.stash_import_active_season')::integer ELSE 0 END $$;
CREATE TEMP TABLE stash_fixture (name text PRIMARY KEY, data jsonb);
INSERT INTO stash_fixture VALUES ('before', pg_temp.stash_progress());
CREATE FUNCTION pg_temp.stash_apply(p_updates jsonb,
  p_id uuid DEFAULT '00000000-0000-0000-0000-000000009411', p_hash text DEFAULT NULL,
  p_expected jsonb DEFAULT NULL, p_mode text DEFAULT 'pvp') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.commit_stash_item_import(p_mode,
    CASE WHEN p_mode = 'seasonal' THEN current_setting('test.stash_import_active_season')::integer ELSE 0 END,
    p_id, coalesce(p_hash, repeat('a',64)), coalesce(p_expected, pg_temp.stash_progress(p_mode)), p_updates) $$;
-- Production default privileges deny client execution, including functions in pg_temp.
GRANT EXECUTE ON FUNCTION pg_temp.stash_progress(text),
  pg_temp.stash_apply(jsonb, uuid, text, jsonb, text) TO authenticated;

SELECT ok(NOT has_function_privilege('anon',
  'public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)', 'EXECUTE'), 'anon cannot call RPC');
SELECT ok(has_function_privilege('authenticated',
  'public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)', 'EXECUTE'), 'authenticated can call RPC');
SELECT ok(NOT has_table_privilege('authenticated', 'private.stash_item_import_receipts', 'SELECT'),
  'raw receipts cannot be read by browser');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'private.stash_item_import_receipts'::regclass),
  'private receipt table has RLS defense');
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid =
  'public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)'::regprocedure), false,
  'public RPC is an invoker wrapper');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$SELECT pg_temp.stash_apply('[{"id":"task-a","type":"task","count":2,"needed":3}]')$$,
  '28000', 'Not authenticated', 'missing auth is rejected');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009402', true);
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009411',repeat('a',64),
  (SELECT data FROM stash_fixture WHERE name='before'), '[{"id":"task-a","type":"task","count":2,"needed":3}]')->>'reason',
  'baseline_changed', 'another account cannot import against the owner snapshot');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009401', true);

SELECT throws_ok(format('SELECT public.commit_stash_item_import(%L,%s,%L,%L,%L,%L)',
  mode,season,'00000000-0000-0000-0000-000000009411',repeat('a',64),'{}','[]'),
  '22023', 'Invalid import mode or season', label)
FROM (VALUES ('invalid',0,'unknown mode rejected'), ('pvp',1,'persistent season rejected'),
  ('seasonal',0,'stale seasonal season rejected')) t(mode,season,label);

-- Every malformed batch is exercised against a valid live baseline. Invalid later entries
-- must roll back the entire batch, with neither a receipt nor the valid first count written.
SELECT throws_ok(format('SELECT pg_temp.stash_apply(%L::jsonb)', payload), '22023', NULL, label)
FROM (VALUES
  ('null','JSON null batch rejected'), ('{}','object batch rejected'), ('[]','empty batch rejected'),
  ('[null]','null update rejected'), ('[1]','scalar update rejected'),
  ('[{"id":"a","type":"task","count":0}]','missing needed rejected'),
  ('[{"id":"a","type":"task","count":0,"needed":1,"complete":true}]','extra fields rejected'),
  ('[{"id":"","type":"task","count":0,"needed":1}]','empty ID rejected'),
  ('[{"id":" ","type":"task","count":0,"needed":1}]','blank ID rejected'),
  ('[{"id":null,"type":"task","count":0,"needed":1}]','null ID rejected'),
  ('[{"id":"a","type":"taskCompletions","count":0,"needed":1}]','arbitrary map rejected'),
  ('[{"id":"a","type":null,"count":0,"needed":1}]','null type rejected'),
  ('[{"id":"a","type":"task","count":null,"needed":1}]','null count rejected'),
  ('[{"id":"a","type":"task","count":"1","needed":1}]','string count rejected'),
  ('[{"id":"a","type":"task","count":-1,"needed":1}]','negative count rejected'),
  ('[{"id":"a","type":"task","count":0.5,"needed":1}]','fraction rejected'),
  ('[{"id":"a","type":"task","count":0,"needed":1.5}]','fractional needed rejected'),
  ('[{"id":"a","type":"task","count":0,"needed":null}]','null needed rejected'),
  ('[{"id":"a","type":"task","count":9007199254740992,"needed":9007199254740992}]','unsafe JS integer rejected'),
  ('[{"id":"a\n","type":"task","count":0,"needed":1}]','control character ID rejected'),
  ('[{"id":"a","type":"task","count":1000001,"needed":1000001}]','oversized integer rejected'),
  ('[{"id":"a","type":"task","count":0,"needed":0}]','zero needed rejected'),
  ('[{"id":"a","type":"task","count":2,"needed":1}]','count above needed rejected'),
  ('[{"id":"a","type":"task","count":0,"needed":1},{"id":"a","type":"task","count":1,"needed":1}]',
    'duplicate target rejected'),
  ('[{"id":"task-a","type":"task","count":2,"needed":3},{"id":"bad","type":"task","count":-1,"needed":3}]',
    'invalid later update rejects valid earlier update')) t(payload,label);
SELECT throws_ok($$SELECT pg_temp.stash_apply('[null]')$$,'22023','Invalid import update',
  'malformed update type fails at the batch boundary');
SELECT throws_ok(format('SELECT pg_temp.stash_apply(%L::jsonb)',
  jsonb_build_array(jsonb_build_object('id',repeat('a',257),'type','task','count',0,'needed',1))),
  '22023', NULL, 'ID length bounded');
SELECT throws_ok(format('SELECT pg_temp.stash_apply(%L::jsonb)',
  (SELECT jsonb_agg(jsonb_build_object('id','id-'||n,'type','task','count',0,'needed',1)) FROM generate_series(1,257)n)),
  '22023', 'Invalid import batch size', 'batch length bounded');
SELECT throws_ok($$SELECT public.commit_stash_item_import('pvp',0,
  '00000000-0000-0000-0000-000000009411',repeat('a',64),'null'::jsonb,'[]')$$,
  '22023', 'Invalid import identity or expected progress', 'JSON null expected rejected');
SELECT throws_ok($$SELECT public.commit_stash_item_import('pvp',0,
  '00000000-0000-0000-0000-000000009411','screenshot text','{}','[]')$$,
  '22023', 'Invalid import identity or expected progress', 'only SHA256 source hashes accepted');
SELECT is(pg_temp.stash_progress(), (SELECT data FROM stash_fixture WHERE name='before'),
  'invalid batches leave all progress unchanged');
SELECT is((SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=auth.uid()),0::bigint,
  'invalid batches leave no receipts');
SELECT is(COALESCE((SELECT count FROM public.mutation_rate_limits WHERE scope='stash-item-import'
  AND subject=auth.uid()::text),0),0,'malformed batches never consume a refundable admission slot');

SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":3,"needed":3}]',
  p_expected := '{}'::jsonb)->>'reason','baseline_changed','whole snapshot must match');
SELECT is(pg_temp.stash_apply('[{"id":"part-a","type":"hideout","count":0,"needed":4},
  {"id":"task-done","type":"task","count":1,"needed":2}]')->>'reason','completed_objective',
  'completed task objective rejects entire batch');
SELECT is(pg_temp.stash_progress(), (SELECT data FROM stash_fixture WHERE name='before'),
  'completed objective conflict does not partly write hideout count');

-- Even a status-only change outside the selected maps invalidates the browser review.
UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,
  '{taskCompletions,quest-a,complete}','false')
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":3,"needed":3}]',
  p_expected := (SELECT data FROM stash_fixture WHERE name='before'))->>'reason','baseline_changed',
  'task status change invalidates review');
UPDATE public.user_game_mode_progress SET progress_data=(SELECT data FROM stash_fixture WHERE name='before')
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;

SET LOCAL ROLE authenticated;
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":3,"needed":3},
  {"id":"part-a","type":"hideout","count":0,"needed":4},
  {"id":"non-mongo-id.with.parts","type":"task","count":0,"needed":1}]')->>'status',
  'applied','owner imports a valid absolute batch through invoker wrapper');
RESET ROLE;
INSERT INTO stash_fixture VALUES ('applied', pg_temp.stash_progress());
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,count}','3'::jsonb,'absolute task count applied');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,complete}','false'::jsonb,
  'full task collection does not hand in task objective');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,foundInRaid}','true'::jsonb,'objective flags preserved');
SELECT ok((pg_temp.stash_progress()#>>'{taskObjectives,task-a,timestamp}')::numeric > 9999999999999,
  'server timestamp strictly exceeds future old timestamp');
SELECT is(pg_temp.stash_progress()#>'{hideoutParts,part-a,count}','0'::jsonb,'zero hideout count is written');
SELECT is(pg_temp.stash_progress()#>'{hideoutParts,part-a,complete}','false'::jsonb,'hideout decrease clears completion');
SELECT is(pg_temp.stash_progress()#>>'{hideoutParts,part-a,customFlag}','keep','hideout flags preserved');
SELECT is(pg_temp.stash_progress() - ARRAY['taskObjectives','hideoutParts'],
  (SELECT data - ARRAY['taskObjectives','hideoutParts'] FROM stash_fixture WHERE name='before'),
  'task completions, modules, level, history, skills and reset epochs preserved');

SELECT public.sync_user_game_mode_progress('pvp',1,NULL,
  jsonb_build_object('pvp',(SELECT data FROM stash_fixture WHERE name='before')),private.active_season_number());
SELECT is(pg_temp.stash_progress(), (SELECT data FROM stash_fixture WHERE name='applied'),
  'delayed normal sync with exact preimport entries cannot undo imported counts or missing entries');
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009411')->>'status',
  'found','timeout lookup finds committed owner receipt');
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009499')->>'status',
  'missing','timeout lookup distinguishes missing receipt');
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009411')->'progress_data',
  pg_temp.stash_progress(),'timeout lookup returns current canonical progress');
SELECT is((SELECT count(*) FROM jsonb_object_keys(public.get_stash_item_import('pvp',0,
  '00000000-0000-0000-0000-000000009411'))),3::bigint,'timeout lookup exposes no source hashes or targets');

UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{level}','43')
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":3,"needed":3},
  {"id":"part-a","type":"hideout","count":0,"needed":4},
  {"id":"non-mongo-id.with.parts","type":"task","count":0,"needed":1}]',
  p_expected := (SELECT data FROM stash_fixture WHERE name='before'))->>'status','replayed','exact request retry is replayed');
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":3,"needed":3},
  {"id":"part-a","type":"hideout","count":0,"needed":4},
  {"id":"non-mongo-id.with.parts","type":"task","count":0,"needed":1}]',
  p_expected := (SELECT data FROM stash_fixture WHERE name='before'))#>>'{progress_data,level}',
  '43','replay returns live progress instead of receipt snapshot');
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":0,"needed":3}]')->>'reason',
  'import_id_reused','same key changed request conflicts');
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":0,"needed":3}]',
  '00000000-0000-0000-0000-000000009412')->>'status','duplicate','same image new key is duplicate');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,count}','3'::jsonb,'duplicates never change counts');
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":0,"needed":3}]',
  '00000000-0000-0000-0000-000000009412',repeat('b',64),
  (SELECT data FROM stash_fixture WHERE name='applied'))->>'status','conflict','other progress edit invalidates full CAS');
SELECT is(pg_temp.stash_apply('[{"id":"part-a","type":"hideout","count":4,"needed":4},
  {"id":"task-a","type":"task","count":1,"needed":3}]',
  '00000000-0000-0000-0000-000000009412',repeat('b',64))->>'status','applied','new reviewed image can reconcile decreases');
SELECT is(pg_temp.stash_progress()#>'{hideoutParts,part-a,complete}','true'::jsonb,'full hideout collection completes only part');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,complete}','false'::jsonb,'task decrease remains incomplete');

UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{progressEpoch}','8')
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":0,"needed":3}]')->>'reason',
  'progress_reset','old import key after reset cannot replay');
SELECT is(pg_temp.stash_apply('[{"id":"task-a","type":"task","count":0,"needed":3}]',
  '00000000-0000-0000-0000-000000009413')->>'reason','progress_reset','old image new key after reset cannot apply');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,count}','1'::jsonb,'reset conflicts do not resurrect or clear counts');

SELECT is(pg_temp.stash_apply('[{"id":"part-a","type":"hideout","count":1,"needed":1}]',
  p_mode := 'pve')->>'status','applied','PvE scope independent from PvP receipt');
SELECT is(pg_temp.stash_apply('[{"id":"part-a","type":"hideout","count":1,"needed":1}]',
  p_mode := 'seasonal')->>'status','applied','active Seasonal scope supported');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,task-a,count}','1'::jsonb,'other mode imports do not change PvP');
SELECT is((SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=auth.uid()),4::bigint,
  'only applied imports receive receipts');

SELECT throws_ok($$SELECT public.commit_stash_item_import('pvp',0,
  '00000000-0000-0000-0000-000000009414',repeat('c',64),'{}',NULL)$$,
  '22023', 'Invalid import updates', 'SQL null updates rejected');
SELECT is(pg_temp.stash_apply('[{"id":"max-count","type":"hideout","count":1000000,"needed":1000000},
  {"id":"max-count","type":"task","count":0,"needed":1}]',
  '00000000-0000-0000-0000-000000009414',repeat('c',64))->>'status','applied',
  'count upper bound and same ID in different maps accepted');
SELECT is(pg_temp.stash_apply((SELECT jsonb_agg(jsonb_build_object('id','boundary-'||n,
  'type','task','count',0,'needed',1)) FROM generate_series(1,256)n),
  '00000000-0000-0000-0000-000000009415',repeat('d',64))->>'status','applied','256-target batch accepted');
UPDATE private.stash_item_import_receipts SET created_at=clock_timestamp()-interval '91 days'
  WHERE user_id=auth.uid() AND import_id='00000000-0000-0000-0000-000000009411';
SELECT is(public.get_stash_item_import('pve',0,'00000000-0000-0000-0000-000000009411')->>'status',
  'missing','read-only lookup treats an expired receipt as missing without exposing it');
SELECT pg_temp.stash_apply('[{"id":"retention","type":"task","count":0,"needed":1}]',
  '00000000-0000-0000-0001-000000000000',repeat('0',64));
SELECT is((SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=auth.uid()
  AND created_at < clock_timestamp()-interval '90 days'),0::bigint,
  'expired receipts are pruned even below the count cap');
DO $$ BEGIN
  FOR n IN 1..101 LOOP
    -- Advance the synthetic fixture's admission window; retention is tested independently
    -- of the production 60/minute gate, which is exercised explicitly below.
    UPDATE public.mutation_rate_limits SET reset_at=clock_timestamp()-interval '1 second'
      WHERE scope='stash-item-import' AND subject=auth.uid()::text;
    PERFORM pg_temp.stash_apply('[{"id":"retention","type":"task","count":0,"needed":1}]',
      ('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,
      lpad(to_hex(n),64,'0'));
  END LOOP;
END $$;
SELECT is((SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=auth.uid()),100::bigint,
  'successful imports bound receipts to 100 per owner across modes');
SELECT is((SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=auth.uid()
  AND created_at < clock_timestamp()-interval '90 days'),0::bigint,'successful imports prune expired receipts');

UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,
  '{taskObjectives,retention}',jsonb_build_object('count',1,'complete',false,'timestamp',99999999999999))
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,retention,count}','1'::jsonb,
  'timestamped postimport manual edit is accepted');
SELECT public.sync_user_game_mode_progress('pvp',1,NULL,'{"pvp":{"progressEpoch":9}}',private.active_season_number());
SELECT is(pg_temp.stash_progress()->'taskObjectives','{}'::jsonb,'full epoch reset clears imported objectives');
SELECT is(pg_temp.stash_progress()->'hideoutParts','{}'::jsonb,'full epoch reset clears imported hideout parts');
SELECT ok(NOT has_function_privilege('anon','public.get_stash_item_import(text,integer,uuid)','EXECUTE'),
  'anon cannot call receipt lookup');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009402',true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0001-000000000101')->>'status',
  'missing','authenticated other account cannot read owner receipt');
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0001-000000000101')->'progress_data',
  'null'::jsonb,'authenticated other account cannot read owner progress');
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009421',repeat('e',64),
  NULL,'[{"id":"fresh","type":"task","count":1,"needed":2}]')->>'status','applied',
  'missing default mode initializes from canonical server empty progress');
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009421',repeat('e',64),
  NULL,'[{"id":"fresh","type":"task","count":1,"needed":2}]')->>'status','replayed',
  'initial import with absent baseline can be retried with immutable null expected');
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009422',repeat('f',64),
  NULL,'[{"id":"fresh","type":"task","count":2,"needed":2}]')->>'status','conflict',
  'null expected conflicts after another initialization created the row');
RESET ROLE;
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,fresh,count}','1'::jsonb,
  'repeated initialization cannot overwrite first import');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009403',true);
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009431',repeat('f',64),
  NULL,'[{"id":"brand-new","type":"hideout","count":1,"needed":2}]')->>'status','applied',
  'brand new account initializes metadata and mode atomically');
SELECT is((SELECT count(*) FROM public.user_progress WHERE user_id=auth.uid()),1::bigint,
  'brand new account receives one defaults-only metadata row');
SELECT is(pg_temp.stash_progress() - 'hideoutParts', public.sanitize_user_progress_mode_data('{}') - 'hideoutParts',
  'absent mode starts from canonical server defaults without client fields');
SELECT throws_ok($$SELECT public.get_stash_item_import('pvp',1,'00000000-0000-0000-0000-000000009431')$$,
  '22023','Invalid import lookup','receipt lookup validates mode and season');

-- A full bucket must reject before touching progress; lookup and commit share one owner
-- budget, across modes. A denial remains a specific HTTP 429 signal to the browser.
INSERT INTO public.mutation_rate_limits(scope,subject,count,reset_at)
  VALUES('stash-item-import',auth.uid()::text,59,clock_timestamp()+interval '1 minute')
  ON CONFLICT(scope,subject) DO UPDATE SET count=59,reset_at=EXCLUDED.reset_at;
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009431')->>'status',
  'found','the 60th owner admission remains available for recovery');
INSERT INTO stash_fixture VALUES ('rate-limited',pg_temp.stash_progress());
SELECT throws_ok($$SELECT public.commit_stash_item_import('pvp',0,
  '00000000-0000-0000-0000-000000009432',repeat('d',64),NULL,
  '[{"id":"brand-new","type":"hideout","count":0,"needed":2}]')$$,
  'PT429','Stash item import rate limit exceeded','a full owner bucket rejects valid commit attempts');
SELECT throws_ok($$SELECT public.get_stash_item_import('pve',0,'00000000-0000-0000-0000-000000009431')$$,
  'PT429','Stash item import rate limit exceeded','lookup cannot bypass the shared owner limit through another mode');
SELECT is(pg_temp.stash_progress(),(SELECT data FROM stash_fixture WHERE name='rate-limited'),
  'rate denial changes no progress');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009402',true);
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009421')->>'status',
  'found','one owner cannot spend another owner admission budget');
UPDATE public.mutation_rate_limits SET count=0,reset_at=clock_timestamp()+interval '1 minute'
  WHERE scope='stash-item-import' AND subject=auth.uid()::text;
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009423',repeat('e',64),
  NULL,'[{"id":"fresh","type":"task","count":1,"needed":2}]')->>'status','duplicate',
  'duplicate source remains nonmutating under admission');
SELECT is((SELECT count FROM public.mutation_rate_limits WHERE scope='stash-item-import'
  AND subject=auth.uid()::text),1,'a duplicate consumes admission');
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009424',repeat('d',64),
  '{}','[{"id":"fresh","type":"task","count":1,"needed":2}]')->>'status','conflict',
  'a valid stale baseline returns conflict under admission');
SELECT is((SELECT count FROM public.mutation_rate_limits WHERE scope='stash-item-import'
  AND subject=auth.uid()::text),2,'a CAS conflict consumes admission');
SELECT is(public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009421',repeat('e',64),
  NULL,'[{"id":"fresh","type":"task","count":1,"needed":2}]')->>'status','replayed',
  'an exact request retry remains idempotent under admission');
SELECT is((SELECT count FROM public.mutation_rate_limits WHERE scope='stash-item-import'
  AND subject=auth.uid()::text),3,'an exact retry consumes admission');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009403',true);
UPDATE public.mutation_rate_limits SET reset_at=clock_timestamp()-interval '1 second'
  WHERE scope='stash-item-import' AND subject=auth.uid()::text;
SELECT is(public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009431')->>'status',
  'found','an elapsed admission window permits recovery again');
SELECT is((SELECT count FROM public.mutation_rate_limits WHERE scope='stash-item-import'
  AND subject=auth.uid()::text),1,'the renewed admission window starts at one');

-- Measure hashes, not wall time: 100 receipts * 256 targets must not cause 25,600
-- repeated hashes for one changed key. Only the touched key is hashed once.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009404',true);
SELECT public.sync_user_game_mode_progress('pvp',1,NULL,jsonb_build_object('pvp',jsonb_build_object(
  'taskObjectives',(SELECT jsonb_object_agg('load-'||n,jsonb_build_object('count',1,'complete',false,'timestamp',100))
    FROM generate_series(1,256)n))),private.active_season_number());
INSERT INTO private.stash_item_import_receipts
  (user_id,game_mode,season_number,import_id,source_hash,request_hash,progress_epoch,protected_entries)
  SELECT auth.uid(),'pvp',0,('00000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid,
    lpad(to_hex(n),64,'0'),repeat('a',64),0,
    (SELECT jsonb_agg(jsonb_build_object('map','taskObjectives','id','load-'||k,
      'before_hash',private.hash_stash_item_import_record('{"count":0,"complete":false,"timestamp":1}'),
      'imported_timestamp',10)) FROM generate_series(1,256)k)
  FROM generate_series(1,100)n;
CREATE TEMP TABLE stash_hash_calls (called boolean);
CREATE OR REPLACE FUNCTION private.hash_stash_item_import_record(p_record jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  INSERT INTO pg_temp.stash_hash_calls VALUES(true);
  RETURN encode(sha256(convert_to(COALESCE(p_record::text,'__missing__'),'UTF8')),'hex');
END $$;
UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{taskObjectives,load-1}',
  '{"count":2,"complete":false,"timestamp":101}') WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is((SELECT count(*) FROM stash_hash_calls),1::bigint,
  'one changed key is hashed once despite 25,600 retained protection entries');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,load-1,count}','2'::jsonb,
  'a timestamped manual edit still passes the bounded guard');
TRUNCATE stash_hash_calls;
UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{taskObjectives,load-1}',
  '{"count":0,"complete":false,"timestamp":1}') WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is((SELECT count(*) FROM stash_hash_calls),1::bigint,'matching stale entries are also hashed once per changed key');
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,load-1,count}','2'::jsonb,
  'retained protection restores the latest current entry after a stale sync');
SELECT public.sync_user_game_mode_progress('pvp',1,NULL,
  '{"pve":{"taskObjectives":{"no-import":{"count":1,"complete":false,"timestamp":1}}}}',
  private.active_season_number());
TRUNCATE stash_hash_calls;
UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{taskObjectives,no-import}',
  '{"count":2,"complete":false,"timestamp":2}') WHERE user_id=auth.uid() AND game_mode='pve' AND season_number=0;
SELECT is((SELECT count(*) FROM stash_hash_calls),0::bigint,'modes without import receipts do no guard hashing');

-- Two successive imports must retain both protected baselines, rather than protecting
-- only the newest before-image. This is the normal path, not a fabricated receipt.
SELECT public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0003-000000000001',repeat('e',64),
  pg_temp.stash_progress(),'[{"id":"chain","type":"task","count":1,"needed":3}]');
INSERT INTO stash_fixture VALUES ('chain-first',pg_temp.stash_progress());
SELECT public.commit_stash_item_import('pvp',0,'00000000-0000-0000-0003-000000000002',repeat('f',64),
  pg_temp.stash_progress(),'[{"id":"chain","type":"task","count":2,"needed":3}]');
UPDATE public.user_game_mode_progress SET progress_data=progress_data#-'{taskObjectives,chain}'
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,chain,count}','2'::jsonb,
  'older missing-key baseline stays protected after a newer import');
UPDATE public.user_game_mode_progress SET progress_data=jsonb_set(progress_data,'{taskObjectives,chain}',
  (SELECT data#>'{taskObjectives,chain}' FROM stash_fixture WHERE name='chain-first'))
  WHERE user_id=auth.uid() AND game_mode='pvp' AND season_number=0;
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,chain,count}','2'::jsonb,
  'the newer import baseline also stays protected');

-- Rehearse emergency client RPC disablement in a subtransaction, then deliberately roll
-- it back. PL/pgSQL variables survive the rollback; ACL/data changes do not. No production
-- disable migration or grant weakening is introduced by this test.
CREATE FUNCTION pg_temp.stash_disable_probe() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_call record;
  v_denied boolean;
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb),
      private.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb),
      public.get_stash_item_import(text,integer,uuid),private.get_stash_item_import(text,integer,uuid)
      FROM authenticated,service_role;
    SET LOCAL ROLE authenticated;
    FOR v_call IN SELECT * FROM (VALUES
      ('public_commit',$sql$SELECT public.commit_stash_item_import('pvp',0,
        '00000000-0000-0000-0003-000000000003',repeat('a',64),'{}',
        '[{"id":"chain","type":"task","count":0,"needed":3}]')$sql$),
      ('private_commit',$sql$SELECT private.commit_stash_item_import('pvp',0,
        '00000000-0000-0000-0003-000000000003',repeat('a',64),'{}',
        '[{"id":"chain","type":"task","count":0,"needed":3}]')$sql$),
      ('public_lookup',$sql$SELECT public.get_stash_item_import('pvp',0,'00000000-0000-0000-0003-000000000001')$sql$),
      ('private_lookup',$sql$SELECT private.get_stash_item_import('pvp',0,'00000000-0000-0000-0003-000000000001')$sql$)
    ) call(name,statement) LOOP
      v_denied := false;
      BEGIN EXECUTE v_call.statement;
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
      END;
      v_result := v_result || jsonb_build_object(v_call.name,v_denied);
    END LOOP;
    RESET ROLE;
    v_result := v_result || jsonb_build_object('service_role_disabled',NOT EXISTS(
      SELECT 1 FROM (VALUES
        ('public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)'),
        ('private.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)'),
        ('public.get_stash_item_import(text,integer,uuid)'),('private.get_stash_item_import(text,integer,uuid)')
      ) signature(value) WHERE has_function_privilege('service_role',value,'EXECUTE')));
    RAISE EXCEPTION 'Roll back the disable rehearsal' USING ERRCODE='ZST01';
  EXCEPTION WHEN SQLSTATE 'ZST01' THEN NULL;
  END;
  RETURN v_result;
END $$;
INSERT INTO stash_fixture VALUES ('disable-proof',pg_temp.stash_disable_probe());
SELECT is((SELECT data->probe.name FROM stash_fixture WHERE name='disable-proof'),'true'::jsonb,
  'forward disable denies '||probe.name)
  FROM (VALUES('public_commit'),('private_commit'),('public_lookup'),('private_lookup'),('service_role_disabled'))probe(name);
SELECT ok(bool_and(has_function_privilege(client.role,signature.value,'EXECUTE')),
  'rolling back the disable rehearsal restores both public/private client grants')
  FROM (VALUES('authenticated'),('service_role'))client(role) CROSS JOIN (VALUES
    ('public.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)'),
    ('private.commit_stash_item_import(text,integer,uuid,text,jsonb,jsonb)'),
    ('public.get_stash_item_import(text,integer,uuid)'),('private.get_stash_item_import(text,integer,uuid)')
  ) signature(value);
SELECT is(pg_temp.stash_progress()#>'{taskObjectives,chain,count}','2'::jsonb,
  'disabled RPC attempts do not modify existing progress');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.get_stash_item_import('pvp',0,'00000000-0000-0000-0000-000000009421')$$,
  '28000','Not authenticated','receipt lookup requires auth');
SELECT * FROM finish();
ROLLBACK;
