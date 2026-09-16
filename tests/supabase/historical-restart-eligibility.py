"""Persistent synthetic historical jobs across actual Edge death and disposable DB restart.
No job is claimed/replayed/promoted. Uses structural exclusion rather than age.
"""
import json,pathlib,subprocess,uuid,time
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
assert sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t'
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic historical fixture setup')")
old=[str(uuid.uuid4()) for _ in range(8)];new=str(uuid.uuid4());quoted=','.join("'"+x+"'" for x in old)
for i,u in enumerate(old):
 status='completed' if i==7 else 'failed'
 sql(f"INSERT INTO public.account_deletion_jobs(user_id,status) VALUES('{u}','{status}')")
sql(f"INSERT INTO private.lifecycle_requests(user_id) VALUES('{new}')")
sql("SELECT public.set_lifecycle_delivery('deletion_intake',false,'synthetic historical fixture sealed')")
before=sql(f"SELECT jsonb_agg(to_jsonb(j) ORDER BY user_id) FROM public.account_deletion_jobs j WHERE user_id IN ({quoted})")
checks=[]
def check(ok,label):
 assert ok,label
 checks.append(label);print('PASS '+label,flush=True)
def verify(stage):
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic eligibility negative test')")
 check(sql(f"SELECT jsonb_agg(to_jsonb(j) ORDER BY user_id) FROM public.account_deletion_jobs j WHERE user_id IN ({quoted})")==before,stage+' historical jobs unchanged')
 check(sql(f"SELECT count(*) FROM private.lifecycle_delivery_eligibility WHERE user_id IN ({quoted})")=='0',stage+' no historical eligibility')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id IN ({quoted})")=='0',stage+' no historical provider work')
 check(sql(f"SELECT count(*) FROM private.lifecycle_delivery_eligibility WHERE user_id='{new}'")=='1',stage+' new request remains eligible')
 for u in old:
  r=subprocess.run(CMD,input=f"BEGIN; INSERT INTO private.lifecycle_requests(user_id) VALUES('{u}'); ROLLBACK;",capture_output=True,text=True)
  assert r.returncode!=0 and 'Historical deletion requires separate operator review' in r.stderr
 check(True,stage+' all eight historical requests refused regardless of status/age')
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',false,'synthetic eligibility negative test complete')")
verify('before crash')
log=(OUT/'historical-worker-crash.log').open('w')
p=subprocess.run(['python3',str(ROOT/'tests/supabase/worker-invocation-crash.py')],stdout=log,stderr=subprocess.STDOUT,timeout=150)
check(p.returncode==0,'actual Edge crash-before-claim and natural lease recovery passed')
verify('after Edge recovery')
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
subprocess.run(['docker','restart',C],stdout=subprocess.DEVNULL,check=True)
start=time.monotonic()
while True:
 p=subprocess.run(CMD,input='SELECT 1;',capture_output=True,text=True)
 if p.returncode==0 and p.stdout.strip()=='1':break
 assert time.monotonic()-start<30;time.sleep(.25)
verify('after database restart')
for role in ['anon','authenticated','service_role']:
 check(sql(f"SELECT has_table_privilege('{role}','private.lifecycle_delivery_eligibility','INSERT')")=='f',role+' cannot promote historical work')
check(sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t','processing remains disabled after restart')
print(json.dumps({'passed':len(checks),'historical_synthetic_jobs':8,'production_changes':0,'historical_jobs_processed':0}),flush=True)
