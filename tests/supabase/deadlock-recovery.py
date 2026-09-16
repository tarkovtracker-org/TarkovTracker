"""Deterministic deadlock injection on actual lifecycle resources, disposable database only.
The injected reverse-order holders model hostile interleavings, not an assertion that
normal candidate entrypoints necessarily acquire locks in this order.
"""
import json,pathlib,subprocess,uuid,time,urllib.request
C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text())
assert cfg['API_URL']=='http://127.0.0.1:59321'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
results=[]
def check(v,label,**data):
 assert v,(label,data)
 results.append(label);print('PASS',label,json.dumps(data),flush=True)
class Session:
 def __init__(self,detect):
  self.name='deadlock-'+uuid.uuid4().hex;self.p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  self.send(f"BEGIN; SET LOCAL application_name='{self.name}'; SET LOCAL statement_timeout='10s'; SET LOCAL deadlock_timeout='{detect}';")
 def send(self,q):self.p.stdin.write(q+'\n');self.p.stdin.flush()
 def ready(self,q):
  self.send(q+';\n\\echo READY')
  while True:
   line=self.p.stdout.readline()
   if not line:raise RuntimeError(self.p.stderr.read())
   if line.strip()=='READY':return
 def close(self):
  if self.p.poll() is None:self.p.kill();self.p.wait()
def wait(s):
 deadline=time.monotonic()+3
 while time.monotonic()<deadline:
  if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{s.name}' AND wait_event_type='Lock'")=='1':return
  time.sleep(.01)
 raise AssertionError('No observed database lock wait')
def user():
 r=urllib.request.Request(cfg['API_URL']+'/auth/v1/admin/users',data=json.dumps({'email':uuid.uuid4().hex+'@example.invalid','password':'Synthetic-test-123!','email_confirm':True}).encode(),headers={'apikey':cfg['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+cfg['SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=10) as v:return json.load(v)['id']
def cycle(uid,hold,blocked,conflict,label):
 a=Session('100ms');b=Session('5s');marker=str(uuid.uuid4())
 try:
  a.ready(f"SELECT private.lifecycle_user_lock('{uid}'); INSERT INTO private.lifecycle_work(id,kind,dedupe_key,user_id,resource_id,action) VALUES('{marker}','discord_cleanup','deadlock:{marker}','{uid}','synthetic','remove_managed_roles')")
  b.ready(hold);b.send(blocked+';');wait(b)
  start=time.monotonic();a.send(conflict+';');a.p.stdin.close();a.p.wait(timeout=8)
  error=a.p.stderr.read();elapsed=time.monotonic()-start
  check(a.p.returncode!=0 and '40P01' in error,label+' aborts explicit deadlock victim',seconds=round(elapsed,3))
  b.ready('SELECT 1');b.send('COMMIT;');b.p.stdin.close();b.p.wait(timeout=5)
  check(b.p.returncode==0,label+' survivor commits')
  check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE id='{marker}'")=='0',label+' victim provider obligation rolled back')
  check(sql(f"SELECT public.request_account_lifecycle('{uid}')") in ['requested','provider_wait','sealed'],label+' bounded fresh request retry succeeds')
 finally:a.close();b.close()
u=user();sql(f"INSERT INTO public.supporters(user_id,type,stripe_customer_id) VALUES('{u}','one_time','cus_synthetic_{uuid.uuid4().hex}')")
cycle(u,f"SELECT user_id FROM public.supporters WHERE user_id='{u}' FOR UPDATE",f"UPDATE public.supporters SET stripe_customer_id=NULL WHERE user_id='{u}'",f"SELECT user_id FROM public.supporters WHERE user_id='{u}' FOR UPDATE",'provider linkage')
check(sql(f"SELECT count(*)>0 FROM private.lifecycle_work WHERE user_id='{u}' AND kind='stripe_cleanup'")=='t','surviving linkage clear preserves provider obligation')
# Team row versus lifecycle barrier, using actual disband operation on surviving side.
u=user();team=json.loads(sql(f"SELECT row_to_json(t) FROM public.create_team_with_owner('synthetic-{uuid.uuid4().hex[:12]}','{uuid.uuid4().hex}',5,'{u}','pvp') t"))
sql(f"SELECT public.request_account_lifecycle('{u}')")
claim=json.loads(sql(f"SELECT row_to_json(j) FROM public.claim_account_deletion_job('{u}',true) j"))['claim_token']
# Explicit synthetic CLEAR for this database-only preparation lock fixture.
proof=json.loads(sql(f"SELECT public.begin_final_billing_verification('{u}','{claim}')"));assert proof['status']=='checking'
assert sql(f"SELECT public.finish_final_billing_verification('{u}','{claim}','{proof['token']}','clear')")=='t'
check(sql(f"SELECT public.seal_account_lifecycle('{u}','{claim}')")=='ready','synthetic deletion sealed before preparation interleaving')
cycle(u,f"SELECT id FROM public.teams WHERE id='{team['id']}' FOR UPDATE",f"SELECT private.lifecycle_user_lock('{u}'); SELECT public.disband_team('{team['id']}','{u}')",f"SELECT public.prepare_account_deletion('{u}','{claim}')",'deletion preparation versus team mutation')
check(sql(f"SELECT public.prepare_account_deletion('{u}','{claim}')")=='ready','actual preparation retry reconciles surviving disband')
check(sql(f"SELECT pvp_team_id IS NULL FROM public.user_system WHERE user_id='{u}'")=='t','surviving disband preserves pointer contract')
print(json.dumps({'passed':len(results),'provider_http_calls':0,'injection':'explicit reverse-order real resource holders'}))
u=user();work=str(uuid.uuid4());fence=str(uuid.uuid4())
sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,user_id,resource_id,action,state,claim_token,lease_until) VALUES('{work}','discord_cleanup','synthetic:{work}','{u}','synthetic','remove_managed_roles','processing','{fence}',clock_timestamp()+interval '2 minutes')")
cycle(u,f"SELECT id FROM private.lifecycle_work WHERE id='{work}' FOR UPDATE",f"SELECT public.finish_lifecycle_work('{work}','{fence}','completed')",f"SELECT id FROM private.lifecycle_work WHERE id='{work}' FOR UPDATE",'task completion')
check(sql(f"SELECT public.finish_lifecycle_work('{work}','{fence}','retryable')")=='f','stale retried completion cannot overwrite surviving completion')
check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{work}'")=='completed','surviving completed state retained')
print(json.dumps({'passed':len(results),'provider_http_calls':0}))
