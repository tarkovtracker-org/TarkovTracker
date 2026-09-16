"""Deterministic late legacy claims and registered-drain barriers; synthetic local DB only."""
import json,pathlib,subprocess,uuid,time,select,os
C='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def state(component):return next(x for x in json.loads(sql('SELECT public.lifecycle_delivery_status()')) if x['component']==component)
results=[]
def check(v,label):
 assert v,label
 results.append(label)
 print('PASS',label,flush=True)
class Session:
 def __init__(self):
  self.name='drain-'+uuid.uuid4().hex
  self.p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  self.run(f"SET application_name='{self.name}'; BEGIN;")
 def send(self,q):self.p.stdin.write((q+'\n\\echo READY\n').encode());self.p.stdin.flush()
 def read(self):
  data=b'';deadline=time.monotonic()+5
  while b'READY\n' not in data:
   assert time.monotonic()<deadline,'Session barrier timed out'
   if select.select([self.p.stdout],[],[],0.1)[0]:
    chunk=os.read(self.p.stdout.fileno(),65536);assert chunk,'Session failed';data+=chunk
  return data.decode().replace('READY\n','').strip()
 def run(self,q):self.send(q);return self.read()
 def close(self):self.run('COMMIT;');self.p.stdin.close();self.p.wait(timeout=5)
for component in ['deletion_intake','deletion_reconcile','provider_processing']:
 sql(f"SELECT public.set_lifecycle_delivery('{component}',true,'synthetic-drain');")
 token=sql(f"SELECT public.begin_lifecycle_delivery('{component}')")
 check(bool(token),component+' admitted before pause')
 sql(f"SELECT public.set_lifecycle_delivery('{component}',false,'synthetic-pause');")
 check(sql(f"SELECT public.begin_lifecycle_delivery('{component}') IS NULL")=='t',component+' new admission denied after pause')
 check(not state(component)['enabled'] and state(component)['active']==1,component+' disabled is not drained and stuck invocation visible')
 if component!='provider_processing':
  late=str(uuid.uuid4());r=subprocess.run(CMD,input=f"INSERT INTO public.account_deletion_jobs(user_id) VALUES('{late}')",text=True,capture_output=True)
  check(r.returncode!=0 and 'Lifecycle admission closed' in r.stderr,component+' pre-bootstrap late unregistered claim rejected')
  user=str(uuid.uuid4());header=json.dumps({'x-lifecycle-delivery':token})
  held=Session();held.run(f"SET LOCAL request.headers='{header}'; INSERT INTO public.account_deletion_jobs(user_id,status,claim_token) VALUES('{user}','in_progress','{uuid.uuid4()}');")
  finisher=Session();start=time.monotonic();finisher.send(f"SELECT public.finish_lifecycle_delivery('{token}');")
  deadline=time.monotonic()+0.8;observed=False
  while time.monotonic()<deadline:
   observed=sql(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{finisher.name}' AND wait_event_type='Lock')")=='t'
   if observed:break
  check(observed,component+' finish waits for registered claim transaction')
  check(state(component)['active']==1,component+' uncommitted claim cannot disappear from drain')
  held.close();check(finisher.read()=='t',component+' finish succeeds after claim commit');finisher.close()
  check(state(component)['legacy_or_registered_job_claims']>=1,component+' committed old or new job remains a drain blocker')
  sql(f"UPDATE public.account_deletion_jobs SET status='completed',claim_token=NULL WHERE user_id='{user}';")
 else:sql(f"SELECT public.finish_lifecycle_delivery('{token}');")
 check(state(component)['active']==0,component+' registered drain reaches zero')
 sql(f"SELECT public.set_lifecycle_delivery('{component}',true,'synthetic-reopen');")
# Provider processing must return to the default disabled operating state.
sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic-done');")
print(json.dumps({'assertions':len(results),'result':'PASS','barriers':'real PostgreSQL locks and explicit transaction commits','production_changes':0}))
