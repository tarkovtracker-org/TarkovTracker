"""Continue the real hosted synthetic Checkout fixture through provider end and Auth deletion.
Explicit TEST fixture cancellation represents a provider change outside the app. App policy
remains cancel-at-period-end, with no refunds/credits/customer deletion.
"""
import sys,json,pathlib,subprocess,urllib.request,urllib.error,time
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
def stripe(method,path):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 p=subprocess.run(args,text=True,capture_output=True,timeout=40);assert p.returncode==0,'TEST provider request failed; private output withheld'
 obj=json.loads(p.stdout);assert 'error' not in obj
 if 'livemode' in obj:assert obj['livemode'] is False
 return obj
assert json.loads(subprocess.check_output(['stripe','whoami','--format','json']))['authenticated']
assert stripe('get','/v1/balance')['livemode'] is False
session=stripe('get','/v1/checkout/sessions/'+json.loads((OUT/'checkout-browser-RESTRICTED.json').read_text())['session_id'])
assert session['status']=='complete' and session['payment_status']=='paid' and session['subscription']
u=session['client_reference_id'];sub=session['subscription'];customer=session['customer']
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def request(path,key=None,data=None,post=False):
 h={'apikey':cfg['ANON_KEY'],'Content-Type':'application/json'}
 if key:h['Authorization']='Bearer '+key
 if key==cfg['SERVICE_ROLE_KEY']:h['apikey']=key
 r=urllib.request.Request(cfg['API_URL']+path,headers=h,data=json.dumps(data).encode() if data is not None else (b'' if post else None))
 try:
  with urllib.request.urlopen(r,timeout=30) as resp:return resp.status,json.loads(resp.read() or b'null')
 except urllib.error.HTTPError as resp:return resp.code,json.loads(resp.read() or b'null')
code,auth=request('/auth/v1/admin/users/'+u,cfg['SERVICE_ROLE_KEY']);assert code==200 and auth['email'].endswith('@example.invalid')
code,login=request('/auth/v1/token?grant_type=password',data={'email':auth['email'],'password':'Synthetic-checkout-123!'});assert code==200;token=login['access_token'];del auth,login
checks=[]
def check(v,label):
 assert v,label
 checks.append(label);print('PASS '+label,flush=True)
def worker(task):
 sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 deadline=time.monotonic()+45
 while True:
  code,result=request('/functions/v1/lifecycle-worker?kind=stripe_cleanup',env['LIFECYCLE_WORKER_SECRET'],post=True)
  if code!=503:break
  assert time.monotonic()<deadline,'Worker admission did not recover within bounded retry window'
  time.sleep(.5)
 check(code==200 and result['result']=={'claimed':1,'advanced':1},'actual Edge advances one selected synthetic obligation')
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
try:
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic checkout end test'); SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic checkout end test')")
 if '--resume-ended' not in sys.argv and '--finalize' not in sys.argv:
  code,deletion=request('/functions/v1/account-delete',token,{})
  check(code==202 and deletion.get('status')=='provider_wait','new deletion request sees preserved checkout provider assets')
 generation=sql(f"SELECT generation FROM private.lifecycle_requests WHERE user_id='{u}'")
 tasks={resource:sql(f"SELECT id FROM private.lifecycle_work WHERE user_id='{u}' AND generation='{generation}' AND resource_id='{resource}' AND dedupe_key LIKE 'deletion:%'") for resource in [sub,customer]}
 check(all(tasks.values()),'separate customer/subscription obligations created from durable evidence')
 if '--resume-ended' not in sys.argv and '--finalize' not in sys.argv:
  worker(tasks[sub]);state=stripe('get','/v1/subscriptions/'+sub)
  check(state['status']=='active' and state['cancel_at_period_end'],'app requests period-end cancellation and keeps subscription active')
  check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{tasks[sub]}'")=='waiting','obligation waits for provider-confirmed end')
  check(sql(f"SELECT count(*) FROM auth.users WHERE id='{u}'")=='1','Auth intact while subscription remains active')
  # Explicit external TEST fixture state transition, not application cancellation policy.
  ended=stripe('delete','/v1/subscriptions/'+sub)
  check(ended['status']=='canceled','provider fixture changed outside app to ended state')
 if '--finalize' not in sys.argv:
  worker(tasks[sub]);check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{tasks[sub]}'")=='completed','worker observes current ended provider truth')
  worker(tasks[customer]);check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{tasks[customer]}'")=='completed','customer reconciliation observes no live subscriptions')
 # Synthetic scheduling-clock advance; no state/claim/attempt/provider obligation is reset.
 sql(f"UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='{u}' AND status='pending'")
 code,done=request('/functions/v1/account-delete',token,{})
 print(json.dumps({'deletion_http_status':code,'deletion_state':done.get('status')}),flush=True)
 check(code==200 and done.get('success') is True,'supported actual Edge/Auth deletion completes only after obligations')
 check(request('/auth/v1/admin/users/'+u,cfg['SERVICE_ROLE_KEY'])[0]==404,'supported Auth API confirms synthetic user absent')
 check(sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u}'")=='completed','durable deletion lifecycle completed')
 check(not stripe('get','/v1/customers/'+customer).get('deleted',False),'customer object preserved')
 print(json.dumps({'passed':len(checks),'provider':'real hosted TEST Checkout subscription','external_fixture_transition':'explicit TEST subscription cancel outside app','application_policy':'cancel at period end','production_changes':0}),flush=True)
finally:
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic end test stopped'); SELECT public.set_lifecycle_delivery('deletion_intake',false,'synthetic end test stopped')")
