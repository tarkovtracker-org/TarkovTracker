"""Final-schema historical eligibility checks; synthetic rows, transaction rolled back."""
import subprocess,json
container='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',container,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable'
assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
cmd=['docker','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
sql='''BEGIN;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='1s';
DO $$
DECLARE old_user UUID; new_user UUID:=gen_random_uuid(); n INTEGER;
BEGIN
 FOR n IN 1..6 LOOP
  old_user:=gen_random_uuid();
  INSERT INTO public.account_deletion_jobs(user_id,status) VALUES(old_user,'failed');
  BEGIN
   INSERT INTO private.lifecycle_requests(user_id) VALUES(old_user);
   RAISE EXCEPTION 'Historical job unexpectedly admitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  IF EXISTS(SELECT 1 FROM private.lifecycle_delivery_eligibility WHERE user_id=old_user)
   OR EXISTS(SELECT 1 FROM private.lifecycle_work WHERE user_id=old_user)
  THEN RAISE EXCEPTION 'Historical work unexpectedly eligible'; END IF;
 END LOOP;
 INSERT INTO private.lifecycle_requests(user_id) VALUES(new_user);
 IF NOT EXISTS(SELECT 1 FROM private.lifecycle_delivery_eligibility WHERE user_id=new_user)
 THEN RAISE EXCEPTION 'New request not admitted'; END IF;
 IF has_table_privilege('anon','private.lifecycle_delivery_eligibility','INSERT')
 OR has_table_privilege('authenticated','private.lifecycle_delivery_eligibility','INSERT')
 OR has_table_privilege('service_role','private.lifecycle_delivery_eligibility','INSERT')
 THEN RAISE EXCEPTION 'Eligibility escalation privilege'; END IF;
 IF EXISTS(SELECT 1 FROM private.lifecycle_work WHERE user_id=new_user)
 THEN RAISE EXCEPTION 'Eligibility alone created provider work'; END IF;
END; $$;
SELECT public.lifecycle_delivery_health() IS NOT NULL;
ROLLBACK;
'''
subprocess.run(cmd,input=sql,text=True,check=True)
print('PASS: six synthetic historical jobs refused; no work or marker created; new request eligible; client/service promotion denied; aggregate health available; rollback')
