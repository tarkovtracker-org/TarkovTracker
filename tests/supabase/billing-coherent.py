"""One uninterrupted disposable Auth/Nuxt/Stripe TEST subscription deletion lifecycle.
Hosted Checkout payment requires browser completion; only the legacy horizon and
explicit terminal Stripe TEST transition are simulated. No production operations.
"""
import sys,concurrent.futures,http.server,json,os,pathlib,secrets,signal,subprocess,threading,time,urllib.request,urllib.error,uuid
SUBSCRIPTION=True
SDK_LOSS=False
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
def worker(kind, task=None):
 if task:sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 deadline=time.monotonic()+45
 while True:
  req=urllib.request.Request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind='+kind,data=b'',headers={'Authorization':'Bearer '+env['LIFECYCLE_WORKER_SECRET'],'apikey':cfg['ANON_KEY']})
  try:
   with urllib.request.urlopen(req,timeout=55) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as r:
   if r.code!=503 or time.monotonic()>deadline:raise AssertionError('Worker did not succeed through actual Edge')
   time.sleep(.3)
listener=None
try:
 signing=subprocess.run(['stripe','listen','--print-secret'],capture_output=True,text=True,timeout=30)
 assert signing.returncode==0 and signing.stdout.strip()==env['STRIPE_WEBHOOK_SECRET'],'TEST listener/runtime pairing required'
 listener_log=OUT/'coherent-listener-RESTRICTED.log';listener_log.touch(mode=0o600);listener_log.chmod(0o600)
 listener=subprocess.Popen(['stripe','listen','--events','checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted','--forward-to',cfg['API_URL']+'/functions/v1/stripe-webhook'],stdout=listener_log.open('w'),stderr=subprocess.STDOUT)
 deadline=time.monotonic()+30
 while 'Ready!' not in listener_log.read_text():
  assert listener.poll() is None and time.monotonic()<deadline,'TEST listener unavailable'
  time.sleep(.2)
 check(True,'genuine signed TEST listener ready before subscription creation')
 for _ in range(120):
  assert process.poll() is None
  try:
   if checkout(None)[0]==401:break
  except OSError:pass
  time.sleep(.5)
 else:raise AssertionError('Actual Nuxt route unavailable')
 assert sql('SELECT private.billing_application_horizon_elapsed()')=='t','Synthetic 25-hour clock fixture required'
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic coherent lifecycle'); SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic coherent lifecycle')")
 u,token=user();code,result=checkout(token);check(code==200,'real reservation-aware Nuxt Checkout created')
 op=state['record']['p_id'];session_id=state['record']['p_resource']
 marker=OUT/'checkout-browser-completed';marker.unlink(missing_ok=True)
 context=OUT/'checkout-browser-RESTRICTED.json';context.write_text(json.dumps({'url':result['url'],'session_id':session_id}));os.chmod(context,0o600)
 print('WAITING isolated hosted TEST Checkout completion',flush=True)
 started=time.monotonic()
 while not marker.exists():
  assert time.monotonic()-started<900,'Hosted checkout not completed'
  time.sleep(.5)
 session=stripe('get','/v1/checkout/sessions/'+session_id)
 check(session['status']=='complete' and session['payment_status']=='paid','hosted TEST payment completed')
 sub=session['subscription'];customer=session['customer']
 check(stripe('get','/v1/subscriptions/'+sub)['status']=='active','real TEST subscription active')
 sql(f"UPDATE private.provider_initiations SET next_check_at=(SELECT min(next_check_at)-interval '1 second' FROM private.provider_initiations) WHERE id='{op}'")
 code,result=worker('checkout_reconciliation');check(code==200,'actual worker reconciles checkout')
 check(sql(f"SELECT state FROM private.provider_initiations WHERE id='{op}'")=='reconciled','reservation reconciled before deletion')
 code,deletion=request_json(cfg['API_URL']+'/functions/v1/account-delete',token,{})
 check(code==202 and deletion.get('status')=='provider_wait','deletion waits for active Stripe subscription')
 generation=sql(f"SELECT generation FROM private.lifecycle_requests WHERE user_id='{u}'")
 tasks={r:sql(f"SELECT id FROM private.lifecycle_work WHERE user_id='{u}' AND generation='{generation}' AND resource_id='{r}' AND dedupe_key LIKE 'deletion:%'") for r in [customer,sub]}
 check(all(tasks.values()),'durable customer and subscription obligations')
 worker('stripe_cleanup',tasks[sub]);current=stripe('get','/v1/subscriptions/'+sub)
 check(current['status']=='active' and current['cancel_at_period_end'],'approved period-end cancellation remains active')
 code,status=rpc('account_lifecycle_status',{'p_user_id':u})
 check(code==200 and status['can_cancel'],'deletion remains reversible while waiting')
 check(request_json(cfg['API_URL']+'/auth/v1/user',token)[0]==200,'Auth/account usable during wait')
 # Controlled TEST provider terminal transition; no production request or automatic application refund/credit.
 ended=stripe('delete','/v1/subscriptions/'+sub,{'prorate':'false','invoice_now':'false'})
 check(ended['status']=='canceled','TEST subscription reaches terminal state outside app')
 deadline=time.monotonic()+45
 while True:
  events=stripe('get','/v1/events',{'type':'customer.subscription.deleted','limit':10})
  event=next((e for e in events['data'] if e['data']['object']['id']==sub),None)
  if event and sql(f"SELECT count(*) FROM private.lifecycle_work WHERE kind='stripe_event' AND dedupe_key='{event['id']}'")=='1':break
  assert time.monotonic()<deadline,'Genuine signed event receipt unavailable'
  time.sleep(.5)
 check(True,'genuine signed Stripe terminal event persisted through actual Edge')
 worker('stripe_cleanup',tasks[sub]);worker('stripe_cleanup',tasks[customer])
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE id IN ('{tasks[sub]}','{tasks[customer]}') AND state='completed'")=='2','provider obligations completed')
 sql(f"UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='{u}' AND status='pending'")
 code,done=request_json(cfg['API_URL']+'/functions/v1/account-delete',token,{})
 check(code==200 and done.get('success') is True,'fresh verification and supported Auth deletion complete coherently')
 check(request_json(cfg['API_URL']+'/auth/v1/admin/users/'+u,cfg['SERVICE_ROLE_KEY'],service=True)[0]==404,'supported Auth API confirms deletion')
 check(sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u}'")=='completed','application lifecycle completed')
 check(sql(f"SELECT verified_at IS NOT NULL FROM private.final_billing_verifications WHERE user_id='{u}'")=='t','fresh provider proof persisted')
 check(not stripe('get','/v1/customers/'+customer).get('deleted',False),'Stripe customer retained')
 print(json.dumps({'passed':len(checks),'single_run':True,'actual':'Nuxt Auth Edge Stripe TEST and genuine signed terminal event','simulated':'25-hour DB horizon and explicit TEST terminal cancellation','production_changes':0}),flush=True)
finally:
 if listener is not None:
  listener.terminate();listener.wait(timeout=10)
 release.set()
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'coherent lifecycle stopped'); SELECT public.set_lifecycle_delivery('deletion_intake',false,'coherent lifecycle stopped')")
 os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=20);server.shutdown()
