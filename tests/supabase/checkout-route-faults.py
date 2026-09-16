"""Real Nuxt/Auth/PostgREST/Stripe TEST Checkout creation and linkage fault boundaries.
This covers open/expired Checkout, not successful hosted Checkout payment/subscription creation.
The proxy injects only local record-link delay/failure; Stripe network failures are not claimed.
"""
import sys,concurrent.futures,http.server,json,os,pathlib,secrets,signal,subprocess,threading,time,urllib.request,urllib.error,uuid
SUBSCRIPTION='--subscription' in sys.argv
SDK_LOSS='--sdk-loss' in sys.argv
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
def stripe(method,path,data=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (data or {}).items():args+=['-d',k+'='+str(v)]
 p=subprocess.run(args,capture_output=True,text=True,timeout=40);assert p.returncode==0,'Stripe TEST request failed; private response withheld'
 obj=json.loads(p.stdout);assert 'error' not in obj
 if 'livemode' in obj:assert obj['livemode'] is False
 return obj
assert json.loads(subprocess.check_output(['stripe','whoami','--format','json']))['authenticated']
assert stripe('get','/v1/balance')['livemode'] is False
# Verify runtime test key and CLI refer to the same test account without exposing it.
req=urllib.request.Request('https://api.stripe.com/v1/account',headers={'Authorization':'Bearer '+env['STRIPE_SECRET_KEY']})
with urllib.request.urlopen(req,timeout=15) as r:runtime_account=json.load(r)
assert runtime_account['id']==stripe('get','/v1/account')['id'];del runtime_account
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def request_json(url,token=None,data=None,service=False):
 headers={'Content-Type':'application/json','apikey':cfg['SERVICE_ROLE_KEY'] if service else cfg['ANON_KEY']}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=json.dumps(data).encode() if data is not None else None),timeout=30) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read() or b'null')
def rpc(name,data):return request_json(cfg['API_URL']+'/rest/v1/rpc/'+name,cfg['SERVICE_ROLE_KEY'],data,True)
def user():
 email='checkout-'+uuid.uuid4().hex+'@example.invalid';password='Synthetic-checkout-123!'
 code,u=request_json(cfg['API_URL']+'/auth/v1/admin/users',cfg['SERVICE_ROLE_KEY'],{'email':email,'password':password,'email_confirm':True},True);assert code==200
 code,t=request_json(cfg['API_URL']+'/auth/v1/token?grant_type=password',None,{'email':email,'password':password});assert code==200
 return u['id'],t['access_token']
checks=[]
def check(ok,label):
 assert ok,label
 checks.append(label);print('PASS '+label,flush=True)
state={'mode':'pass','record':None};reached=threading.Event();release=threading.Event()
class Proxy(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def forward(self):
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  if self.path=='/rest/v1/rpc/record_provider_initiation':
   state['record']=json.loads(body);reached.set()
   if state['mode']=='hold':release.wait(4)
   if state['mode']=='fail':self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"synthetic linkage unavailable"}');return
  headers={k:v for k,v in self.headers.items() if k.lower() not in ['host','connection','content-length']}
  request=urllib.request.Request(cfg['API_URL']+self.path,data=body if self.command=='POST' else None,headers=headers,method=self.command)
  try:response=urllib.request.urlopen(request,timeout=10)
  except urllib.error.HTTPError as e:response=e
  with response:
   raw=response.read();self.send_response(response.status)
   for k,v in response.headers.items():
    if k.lower() not in ['transfer-encoding','connection','content-length']:self.send_header(k,v)
   self.end_headers()
   try:self.wfile.write(raw)
   except (BrokenPipeError,ConnectionResetError):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',59501),Proxy);threading.Thread(target=server.serve_forever,daemon=True).start()
empty=OUT/'nuxt-empty.env';empty.write_text('');os.chmod(empty,0o600)
localenv={k:os.environ[k] for k in ['PATH','HOME','LANG','XDG_CACHE_HOME'] if k in os.environ}
localenv.update({'NODE_ENV':'development','SUPABASE_URL':'http://127.0.0.1:59501','SUPABASE_ANON_KEY':cfg['ANON_KEY'],'NUXT_SUPABASE_SERVICE_KEY':cfg['SERVICE_ROLE_KEY'],'STRIPE_SECRET_KEY':env['STRIPE_SECRET_KEY'],'APP_URL':'http://127.0.0.1:59500','NUXT_TELEMETRY_DISABLED':'1','NITRO_PRESET':'node-server'})
if SUBSCRIPTION:
 product=stripe('post','/v1/products',{'name':'Synthetic Package B checkout'})
 price=stripe('post','/v1/prices',{'product':product['id'],'unit_amount':100,'currency':'usd','recurring[interval]':'month'})
 localenv['STRIPE_PRICE_SCAV_MONTHLY']=price['id']
if SDK_LOSS:
 fault_flag=OUT/'checkout-sdk-loss-active';fault_flag.write_text('controlled test fault')
 fault_ids=OUT/'checkout-sdk-loss-identifiers-RESTRICTED.jsonl';fault_ids.write_text('');os.chmod(fault_ids,0o600)
 shim=OUT/'checkout-sdk-loss.mjs'
 shim.write_text("""import https from 'node:https';import fs from 'node:fs';
const original=https.request;
https.request=function(options,...args){
 const request=original.call(this,options,...args);const emit=request.emit;
 request.emit=function(event,...values){
  if(event==='response' && options.host==='api.stripe.com' && options.method==='POST' && options.path==='/v1/checkout/sessions' && fs.existsSync(FLAG)) {
   const response=values[0];let data='';response.setEncoding('utf8');response.on('data',chunk=>data+=chunk);
   response.on('end',()=>{const object=JSON.parse(data);if(object.livemode!==false || !object.id?.startsWith('cs_test_')) throw new Error('Unsafe test response');
    fs.appendFileSync(IDS,JSON.stringify({id:object.id})+'\\n',{mode:0o600});
    const error=Object.assign(new Error('Controlled loss after real TEST success'),{code:'ECONNRESET'});emit.call(request,'error',error);
   });return true;
  }
  return emit.call(this,event,...values);
 };return request;
};
""".replace('FLAG',json.dumps(str(fault_flag))).replace('IDS',json.dumps(str(fault_ids))))
 localenv['NODE_OPTIONS']='--import='+str(shim)
log=(OUT/'checkout-nuxt-RESTRICTED.log').open('w');os.chmod(log.name,0o600)
process=subprocess.Popen([str(ROOT/'node_modules/.bin/nuxt'),'dev','--host','127.0.0.1','--port','59500','--dotenv',str(empty),'--no-fork'],cwd=ROOT,env=localenv,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
def checkout(token):return request_json('http://127.0.0.1:59500/api/stripe/checkout',token,({'mode':'subscription','tier':'scav','interval':'monthly'} if SUBSCRIPTION else {'mode':'payment','amount':5}))
try:
 for _ in range(120):
  assert process.poll() is None,'Nuxt exited; inspect restricted local log'
  try:
   if checkout(None)[0]==401:break
  except OSError:pass
  time.sleep(.5)
 else:raise AssertionError('Nuxt did not reach authenticated checkout route')
 check(True,'actual Nuxt middleware rejects anonymous checkout')
 assert sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t'
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic checkout fault test')")
 if SDK_LOSS:
  u,token=user();code,lost=checkout(token)
  check(code==502,'actual Stripe SDK reports controlled lost success')
  ids=[json.loads(line)['id'] for line in fault_ids.read_text().splitlines()]
  check(len(ids)>=1 and len(set(ids))==1,'SDK retries create one real TEST Checkout session')
  op=sql(f"SELECT id FROM private.provider_initiations WHERE user_id='{u}'")
  check(sql(f"SELECT resource_id IS NULL AND state='unresolved' FROM private.provider_initiations WHERE id='{op}'")=='t','lost SDK response leaves durable unresolved reservation')
  code,deletion=request_json(cfg['API_URL']+'/functions/v1/account-delete',token,{})
  check(code==202 and deletion.get('status')=='provider_wait','deletion blocked after provider success with unknown local identifier')
  fault_flag.unlink();code,recovered=checkout(token)
  check(code==200 and state['record']['p_resource']==ids[0],'retry recovers same real provider session after SDK loss')
  check(sql(f"SELECT resource_id='{ids[0]}' FROM private.provider_initiations WHERE id='{op}'")=='t','recovered provider identifier durably recorded')
  check(sql(f"SELECT count(*) FROM auth.users WHERE id='{u}'")=='1','Auth remains intact until provider resolution')
  print(json.dumps({'passed':len(checks),'provider':'real Stripe TEST','fault':'controlled Node HTTPS success-response loss before Stripe SDK resolution','SDK_responses_lost':len(ids),'unique_provider_sessions':len(set(ids)),'production_changes':0}),flush=True)
  raise SystemExit(0)
 u,token=user();state['mode']='hold';reached.clear();release.clear()
 with concurrent.futures.ThreadPoolExecutor() as pool:
  pending=pool.submit(checkout,token);check(reached.wait(20),'real Stripe session exists before delayed local linkage')
  op=state['record']['p_id'];session_id=state['record']['p_resource']
  code,deletion=request_json(cfg['API_URL']+'/functions/v1/account-delete',token,{})
  check(code==202 and deletion.get('status')=='provider_wait','unresolved initiation blocks actual deletion endpoint')
  check(sql(f"SELECT resource_id IS NULL FROM private.provider_initiations WHERE id='{op}'")=='t','local session identifier still absent at barrier')
  release.set();code,result=pending.result();check(code==200,'delayed linkage survives reversible deletion request')
 session=stripe('get','/v1/checkout/sessions/'+session_id)
 check(session['status']=='open' and session['client_reference_id']==u,'current test provider state belongs to synthetic user')
 if SUBSCRIPTION:
  marker=OUT/'checkout-browser-completed';marker.unlink(missing_ok=True)
  context=OUT/'checkout-browser-RESTRICTED.json';context.write_text(json.dumps({'url':result['url'],'session_id':session_id}));os.chmod(context,0o600)
  print('WAITING isolated hosted TEST Checkout completion',flush=True)
  start=time.monotonic()
  while not marker.exists():
   assert time.monotonic()-start<300,'Hosted TEST Checkout completion unavailable'
   time.sleep(.5)
  session=stripe('get','/v1/checkout/sessions/'+session_id)
  check(session['status']=='complete' and session['payment_status']=='paid' and bool(session['subscription']),'genuine hosted test checkout created paid subscription')
 check(sql(f"SELECT resource_id='{session_id}' AND state='unresolved' FROM private.provider_initiations WHERE id='{op}'")=='t','durable unresolved initiation retained after linkage')
 check(sql(f"SELECT count(*) FROM auth.users WHERE id='{u}'")=='1','Auth remains intact while checkout unresolved')
 state['mode']='pass';code,duplicate=checkout(token)
 check(code==200 and duplicate['url']==result['url'],'duplicate real checkout uses same Stripe idempotency result')
 check(sql(f"SELECT count(*) FROM private.provider_initiations WHERE user_id='{u}'")=='1','duplicate produces one durable reservation')
 code,withdrawn=rpc('account_lifecycle_status',{'p_user_id':u,'p_cancel':True})
 check(code==200 and withdrawn['state']=='cancelled','withdrawal succeeds before irreversible preparation')
 code,after=checkout(token);check(code==200 and after['url']==result['url'],'withdrawal does not invent new checkout or reactivate anything')
 # Lost local linkage response: external session exists, application intentionally receives failure.
 v,vtoken=user();state['mode']='fail';code,failed=checkout(vtoken)
 check(code==502,'local linkage failure is not acknowledged as successful checkout')
 lost_id=state['record']['p_resource'];lost_op=state['record']['p_id']
 check(stripe('get','/v1/checkout/sessions/'+lost_id)['status']=='open','Stripe success persists despite local linkage failure')
 code,d=request_json(cfg['API_URL']+'/functions/v1/account-delete',vtoken,{})
 check(code==202 and d.get('status')=='provider_wait','unknown session reservation blocks Auth deletion')
 state['mode']='pass';code,retried=checkout(vtoken)
 check(code==200 and state['record']['p_resource']==lost_id and state['record']['p_id']==lost_op,'real idempotent retry recovers original missing identifier')
 # Explicit synthetic irreversible-state fixture; no Auth deletion/provider call used to construct it.
 w,wtoken=user();sql(f"INSERT INTO private.lifecycle_requests(user_id,state) VALUES('{w}','prepared')")
 prior_record=state['record'];code,denied=checkout(wtoken)
 check(code==502 and state['record']==prior_record,'irreversible barrier rejects checkout before session-record path')
 check(sql(f"SELECT count(*) FROM private.provider_initiations WHERE user_id='{w}'")=='0','irreversible boundary creates no reservation')
 # A genuine provider state change: expire the open test session, then use actual Edge reconciler.
 if not SUBSCRIPTION:stripe('post','/v1/checkout/sessions/'+session_id+'/expire')
 sql(f"UPDATE private.provider_initiations SET next_check_at=(SELECT min(next_check_at)-interval '1 second' FROM private.provider_initiations) WHERE id='{op}'")
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic checkout reconciliation')")
 code,worker=request_json(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=checkout_reconciliation',env['LIFECYCLE_WORKER_SECRET'],None)
 # Worker requires POST even with empty body.
 if code==405:
  request=urllib.request.Request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=checkout_reconciliation',data=b'',headers={'Authorization':'Bearer '+env['LIFECYCLE_WORKER_SECRET'],'apikey':cfg['ANON_KEY']})
  with urllib.request.urlopen(request,timeout=30) as r:code=r.status;worker=json.load(r)
 check(code==200 and worker['result']=={'examined':1,'completed':1},'real Edge reconciliation uses current terminal Stripe session')
 check(sql(f"SELECT state FROM private.provider_initiations WHERE id='{op}'")=='reconciled','terminal checkout reaches durable reconciled state')
 if SUBSCRIPTION:
  check(sql(f"SELECT count(*) FROM private.provider_assets WHERE user_id='{u}'")=='2','customer and subscription identifiers durably preserved')
 print(json.dumps({'passed':len(checks),'actual':'Nuxt Auth PostgREST Stripe TEST Edge','simulation':'local record-link delay/failure and prepared-state fixture','not_covered':('subscription termination race; SDK response loss uses separate mode' if SUBSCRIPTION else 'hosted payment completion; SDK response loss uses separate mode'),'production_changes':0}),flush=True)
finally:
 release.set();state['mode']='pass'
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'checkout test stopped'); SELECT public.set_lifecycle_delivery('deletion_intake',false,'checkout test stopped')")
 os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=20);server.shutdown()
