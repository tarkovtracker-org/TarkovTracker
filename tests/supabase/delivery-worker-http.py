"""Actual disposable Edge + PostgREST worker admission/auth; no provider calls in this suite."""
import json,pathlib,subprocess,urllib.request,urllib.error,uuid,time
C='supabase_db_tt-b-http-disposable';ROOT=pathlib.Path('/tmp/tt-b-delivery-final')
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());BASE=cfg['API_URL']
assert BASE=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.project']=='tt-b-http-disposable'
env=dict(line.split('=',1) for line in (ROOT/'edge.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
secret=env['LIFECYCLE_WORKER_SECRET'];assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
def sql(q):return subprocess.check_output(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
def req(path,token=None,body=None,method='POST'):
 headers={'apikey':cfg['ANON_KEY'],'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(BASE+path,headers=headers,data=body,method=method)
 try:
  with urllib.request.urlopen(request,timeout=15) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'null')
results=[]
def check(v,label):
 assert v,label
 results.append(label);print('PASS',label,flush=True)
endpoint='/functions/v1/lifecycle-worker?kind=discord_cleanup'
for _ in range(30):
 try:
  status,_=req(endpoint)
  if status==401:break
 except OSError:pass
 time.sleep(.2)
else:raise AssertionError('Local Edge not ready')
check(status==401,'anonymous denied by actual Edge')
check(req(endpoint,'wrong-worker-secret')[0]==401,'wrong dedicated secret denied')
check(req(endpoint,cfg['SERVICE_ROLE_KEY'])[0]==401,'service-role credential is not worker invocation authority')
email='delivery-'+uuid.uuid4().hex+'@example.invalid';password='Synthetic-Delivery-123!'
status,user=req('/auth/v1/admin/users',cfg['SERVICE_ROLE_KEY'],json.dumps({'email':email,'password':password,'email_confirm':True}).encode());assert status==200
status,session=req('/auth/v1/token?grant_type=password',body=json.dumps({'email':email,'password':password}).encode());assert status==200
token=session['access_token']
check(req(endpoint,token)[0]==401,'real Auth user credential denied')
sql(f"INSERT INTO public.user_system(user_id,is_admin) VALUES('{user['id']}',true) ON CONFLICT(user_id) DO UPDATE SET is_admin=true;")
check(sql(f"SELECT is_admin FROM public.user_system WHERE user_id='{user['id']}'")=='t','synthetic browser user actually holds admin flag')
check(req(endpoint,token)[0]==401,'privileged browser user denied')
check(req(endpoint,secret)[0]==503,'correct dedicated secret reaches disabled processing gate')
check(sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE component='provider_processing' AND finished_at IS NULL")=='0','disabled invocation does not admit work')
for kind in ['constructor','__proto__','toString','account_delete']:
 check(req('/functions/v1/lifecycle-worker?kind='+kind,secret)[0]==400,'invalid kind '+kind+' denied before admission')
check(req(endpoint,secret,b'{"limit":1000}')[0]==400,'caller batch body rejected')
assert sql('SELECT count(*) FROM private.lifecycle_work')=='0','Run no-op test before other provider fixtures'
sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic-http');")
try:
 historical=[str(uuid.uuid4()) for _ in range(6)]
 for uid in historical:
  sql(f"INSERT INTO public.account_deletion_jobs(user_id,status) VALUES('{uid}','failed')")
 status,result=req(endpoint,secret)
 check(status==200 and result['result']=={'claimed':0,'advanced':0},'real Edge service client executes bounded no-op')
 labels=','.join("'"+uid+"'" for uid in historical)
 check(sql(f"SELECT count(*) FROM public.account_deletion_jobs WHERE user_id IN ({labels}) AND status='failed'")=='6','actual worker leaves six synthetic historical jobs on HOLD')
 check(sql(f"SELECT count(*) FROM private.lifecycle_delivery_eligibility WHERE user_id IN ({labels})")=='0','worker never promotes historical job eligibility')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id IN ({labels})")=='0','worker does not manufacture historical provider work')
 status,result=req('/functions/v1/lifecycle-worker?kind=checkout_reconciliation',secret)
 check(status==200 and result['result']=={'examined':0,'completed':0},'checkout reconciliation delivery route executes bounded no-op')
 check(sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE component='provider_processing' AND finished_at IS NULL")=='0','real Edge releases admission after no-op')
 health=json.loads(sql('SELECT public.lifecycle_delivery_health()'))
 check('controls' in health and 'work' in health and 'historical_jobs_without_eligibility' in health,'health aggregates available without identifiers')
finally:sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic-http-finished');")
print(json.dumps({'passed':len(results),'runtime':'real local Supabase Edge','auth':'real local Auth','database':'real PostgREST','provider_calls':0}))
