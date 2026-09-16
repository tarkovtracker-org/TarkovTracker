"""Real reservation-aware Portal issuance, with explicit Stripe TEST API equivalents
of portal cancellation/resumption after simulated cutover. Never uses live mode.
"""
import json,os,pathlib,signal,subprocess,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http' and labels['com.supabase.cli.project']=='tt-b-http-disposable'
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def stripe(method,path,data=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (data or {}).items():args+=['-d',k+'='+str(v)]
 p=subprocess.run(args,capture_output=True,text=True,timeout=40);assert p.returncode==0,'TEST Stripe request failed (response withheld)'
 obj=json.loads(p.stdout);assert 'error' not in obj
 if 'livemode' in obj:assert obj['livemode'] is False
 return obj
assert stripe('get','/v1/balance')['livemode'] is False
req=urllib.request.Request('https://api.stripe.com/v1/account',headers={'Authorization':'Bearer '+env['STRIPE_SECRET_KEY']})
with urllib.request.urlopen(req,timeout=15) as r:assert json.load(r)['id']==stripe('get','/v1/account')['id']
def request(url,token=None,data=None,service=False):
 headers={'Content-Type':'application/json','apikey':cfg['SERVICE_ROLE_KEY'] if service else cfg['ANON_KEY']}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None),timeout=55) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read() or b'null')
def rpc(name,data):return request(cfg['API_URL']+'/rest/v1/rpc/'+name,cfg['SERVICE_ROLE_KEY'],data,True)
def user():
 email='portal-'+uuid.uuid4().hex+'@example.invalid';pw='Synthetic-Portal-123!'
 code,u=request(cfg['API_URL']+'/auth/v1/admin/users',cfg['SERVICE_ROLE_KEY'],{'email':email,'password':pw,'email_confirm':True},True);assert code==200
 code,t=request(cfg['API_URL']+'/auth/v1/token?grant_type=password',data={'email':email,'password':pw});assert code==200
 return u['id'],t['access_token']
checks=[]
def check(ok,label):assert ok,label;checks.append(label);print('PASS '+label,flush=True)
def worker(task):
 sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 deadline=time.monotonic()+45
 while True:
  code,result=request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=stripe_cleanup',env['LIFECYCLE_WORKER_SECRET'],b'')
  if code==200:return result
  assert code==503 and time.monotonic()<deadline,'actual worker request failed: '+str(code)
  time.sleep(.3)
assert sql('SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()')=='0'
localenv={k:os.environ[k] for k in ['PATH','HOME','LANG','XDG_CACHE_HOME'] if k in os.environ}
localenv.update({'NODE_ENV':'development','SUPABASE_URL':cfg['API_URL'],'SUPABASE_ANON_KEY':cfg['ANON_KEY'],'NUXT_SUPABASE_SERVICE_KEY':cfg['SERVICE_ROLE_KEY'],'STRIPE_SECRET_KEY':env['STRIPE_SECRET_KEY'],'APP_URL':'http://127.0.0.1:59500','NUXT_TELEMETRY_DISABLED':'1','NITRO_PRESET':'node-server'})
log=(OUT/'portal-nuxt-RESTRICTED.log').open('w');os.chmod(log.name,0o600)
process=subprocess.Popen([str(ROOT/'node_modules/.bin/nuxt'),'dev','--host','127.0.0.1','--port','59500','--dotenv',str(OUT/'nuxt-empty.env'),'--no-fork'],cwd=ROOT,env=localenv,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 for _ in range(120):
  assert process.poll() is None
  try:
   if request('http://127.0.0.1:59500/api/stripe/portal',data={})[0]==401:break
  except OSError:pass
  time.sleep(.5)
 else:raise AssertionError('Nuxt Portal unavailable')
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic Portal cutover'); SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic Portal cutover')")
 product=stripe('post','/v1/products',{'name':'Synthetic Portal cutover'})
 price=stripe('post','/v1/prices',{'product':product['id'],'unit_amount':100,'currency':'usd','recurring[interval]':'month'})
 for legacy in (False,True):
  u,token=user();customer=stripe('post','/v1/customers',{'source':'tok_visa','metadata[user_id]':u})['id']
  old=stripe('post','/v1/subscriptions',{'customer':customer,'items[0][price]':price['id'],'metadata[user_id]':u})['id']
  stripe('delete','/v1/subscriptions/'+old,{'prorate':'false','invoice_now':'false'})
  sql(f"SELECT public.request_account_lifecycle('{u}'); SELECT private.capture_provider_obligation('{u}','stripe_cleanup','{old}','deletion:'||(SELECT generation::text FROM private.lifecycle_requests WHERE user_id='{u}'))")
  oldtask=sql(f"SELECT id FROM private.lifecycle_work WHERE user_id='{u}' AND resource_id='{old}'")
  worker(oldtask);check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{oldtask}'")=='completed','real terminal old subscription task completed')
  code,cancelled=rpc('account_lifecycle_status',{'p_user_id':u,'p_cancel':True});assert code==200 and cancelled['state']=='cancelled'
  sub=stripe('post','/v1/subscriptions',{'customer':customer,'items[0][price]':price['id'],'metadata[user_id]':u})['id']
  sql(f"INSERT INTO public.supporters(user_id,type,tier,status,stripe_customer_id,stripe_subscription_id) VALUES('{u}','subscription','scav','active','{customer}','{sub}')")
  if legacy:
   portal=stripe('post','/v1/billing_portal/sessions',{'customer':customer,'return_url':'http://127.0.0.1:59500/supporter'})
   check(portal['id'].startswith('bps_'),'real legacy TEST Portal issued before cutover')
  else:
   code,portal=request('http://127.0.0.1:59500/api/stripe/portal',token,{})
   check(code==200 and portal.get('url','').startswith('https://billing.stripe.com/'),'real reservation-aware Portal issued before cutover')
   check(sql(f"SELECT count(*) FROM private.provider_initiations WHERE user_id='{u}' AND operation='portal' AND resource_id LIKE 'bps_%' AND state='unresolved'")=='1','Portal durable reservation recorded')
  # No URL is written or reported. Provider API updates below explicitly simulate
  # the customer actions available in Portal; they are not claimed browser clicks.
  del portal
  sql("SELECT public.confirm_billing_application_cutover(repeat('a',64),repeat('b',64),'synthetic Portal post-issuance cutover')")
  check(sql('SELECT private.billing_application_horizon_elapsed()')=='f','actual cutover timestamp restarts barrier')
  stripe('post','/v1/subscriptions/'+sub,{'cancel_at_period_end':'true'})
  current=stripe('post','/v1/subscriptions/'+sub,{'cancel_at_period_end':'false'})
  check(current['status']=='active' and not current['cancel_at_period_end'],'TEST equivalent Portal resumes active subscription after cutover')
  sql("UPDATE private.billing_application_cutovers SET confirmed_at=clock_timestamp()-interval '25 hours'")
  code,result=request(cfg['API_URL']+'/functions/v1/account-delete',token,{})
  check(code==202 and result.get('status')=='provider_wait','old completed task and elapsed horizon cannot delete active account')
  check(request(cfg['API_URL']+'/auth/v1/user',token)[0]==200,'synthetic Auth remains usable')
  task=sql(f"SELECT id FROM private.lifecycle_work WHERE user_id='{u}' AND resource_id='{sub}' AND dedupe_key LIKE 'deletion:%'")
  worker(task);current=stripe('get','/v1/subscriptions/'+sub)
  check(current['status']=='active' and current['cancel_at_period_end'],'current reconciliation enforces period-end waiting policy')
  check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{oldtask}'")=='completed','old completed evidence remains completed but cannot override new obligation')
  check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{task}'")!='completed','active newer subscription task cannot complete')
  # Stop before irreversible deletion: coherent Auth transport is a separate gate.
  ended=stripe('delete','/v1/subscriptions/'+sub,{'prorate':'false','invoice_now':'false'})
  check(ended['status']=='canceled','TEST provider reaches approved terminal state')
  worker(task);check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{task}'")=='completed','current terminal provider reconciliation completes newer task')
  if not legacy:check(sql(f"SELECT state FROM private.provider_initiations WHERE user_id='{u}' AND operation='portal'")=='unresolved','terminal provider alone does not silently resolve Portal authority')
 print(json.dumps({'passed':len(checks),'failed':0,'portal_sessions':'real TEST','post_cutover_actions':'explicit TEST API equivalents, not browser interaction','horizon':'synthetic 25-hour DB fixture','production_changes':0}),flush=True)
finally:
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'Portal test stopped'); SELECT public.set_lifecycle_delivery('deletion_intake',false,'Portal test stopped')")
 os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=20)
