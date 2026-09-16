"""Genuine CLI-signed test events through unchanged local Edge. No secret values read.
CLI authentication is operator configured. Signed envelopes stay in memory only.
"""
import concurrent.futures,http.server,threading,subprocess,json,pathlib,urllib.request,urllib.error,time,uuid,os,secrets,hmac,re
ROOT=pathlib.Path('/tmp/tt-b-lifecycle-validation');CFG=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());BASE=CFG['API_URL'];C='supabase_db_tt-b-http-disposable'
assert BASE=='http://127.0.0.1:59321' and CFG['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http' and labels['com.supabase.cli.project']=='tt-b-http-disposable'
auth=json.loads(subprocess.check_output(['stripe','whoami','--format','json']));assert auth['authenticated'] is True;del auth
nonce=secrets.token_urlsafe(32)
fault=None; barrier=threading.Event(); release=threading.Event()
results=[];events={};condition=threading.Condition();listener=None;server=None;edge=None
served=pathlib.Path("/tmp/tt-b-http/supabase/functions/stripe-webhook/index.ts");original=served.read_text();original_mode=served.stat().st_mode & 0o777
assert original==pathlib.Path("supabase/functions/stripe-webhook/index.ts").read_text()

def check(value,label):
 if not value:raise AssertionError(label)
 results.append(label);print('PASS',label,flush=True)
def stripe(method,path,params=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (params or {}).items():args+=['-d',k+'='+str(v)]
 r=subprocess.run(args,capture_output=True,text=True,timeout=45)
 if r.returncode:raise RuntimeError('Stripe CLI request failed; no raw provider payload logged')
 value=json.loads(r.stdout)
 if 'error' in value:raise RuntimeError('Stripe rejected test fixture request: '+str(value['error'].get('code','unknown')))
 if 'livemode' in value:assert value['livemode'] is False
 return value

def sql(q):return subprocess.check_output(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
def request(path,body,headers):
 r=urllib.request.Request(BASE+path,data=body,headers=headers)
 try:
  with urllib.request.urlopen(r,timeout=20) as v:return v.status,json.loads(v.read() or b'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'null')
def send(envelope,change=None):
 body,signature=envelope
 if change=='body':body=body+b' '
 if change=='invalid':signature='invalid'
 headers={'Content-Type':'application/json'}
 if change!='missing':headers['stripe-signature']=signature
 return request('/functions/v1/stripe-webhook',body,headers)
class Capture(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def authorized(self):
  if hmac.compare_digest(self.headers.get('x-tt-staging-nonce',''),nonce):return True
  self.send_response(403);self.end_headers();return False
 def do_GET(self):
  if not self.authorized():return
  stage=self.path.rsplit('/',1)[-1]
  if fault=='crash_'+stage:
   barrier.set();release.wait(timeout=30)
  payload=json.dumps({'mode':fault if stage=='stripe' else None}).encode()
  self.send_response(200);self.end_headers();self.wfile.write(payload)
 def do_POST(self):
  if not self.authorized():return
  length=int(self.headers.get('Content-Length','0'))
  if not 0 < length <= 1048576:
   self.send_response(400);self.end_headers();return
  body=self.rfile.read(length);obj=json.loads(body)
  if not re.fullmatch(r'evt_[A-Za-z0-9]+',str(obj.get('id',''))) or not re.fullmatch(r'[a-z0-9_.]{1,100}',str(obj.get('type',''))):
   self.send_response(400);self.end_headers();return
  if obj.get('livemode') is not False:
   self.send_response(400);self.end_headers();return
  signature=self.headers.get('stripe-signature','')
  with condition:events[obj['id']]=(obj,(body,signature));condition.notify_all()
  self.send_response(200);self.end_headers()

def received(subid,kind,after=None):
 deadline=time.monotonic()+35
 with condition:
  while time.monotonic()<deadline:
   for event,envelope in events.values():
    if event['type']==kind and event['data']['object'].get('id')==subid and event['id'] not in (after or set()):return event,envelope
   condition.wait(timeout=1)
 raise AssertionError('No genuine Stripe listener event captured')
def inbox(eid):return json.loads(sql(f"SELECT row_to_json(w) FROM (SELECT state,attempts,error_code FROM private.lifecycle_work WHERE resource_id='{eid}') w") or 'null')
def restart_edge():
 global edge
 import signal
 for d in pathlib.Path('/proc').iterdir():
  if not d.name.isdigit():continue
  try:
   args=(d/'cmdline').read_bytes().decode().split('\0')
   if 'functions' in args and 'serve' in args and '/tmp/tt-b-http' in args:os.kill(int(d.name),signal.SIGINT)
  except (OSError,UnicodeError):pass
 time.sleep(2)
 log=open(ROOT/'signed-edge-runtime-private.log','a');os.chmod(ROOT/'signed-edge-runtime-private.log',0o600)
 edge=subprocess.Popen([str(pathlib.Path.cwd()/'node_modules/.bin/supabase'),'functions','serve','--workdir','/tmp/tt-b-http','--import-map','/tmp/tt-b-http/supabase/functions/deno.json','--env-file','/tmp/tt-b-delivery-final/edge.env'],stdout=log,stderr=subprocess.STDOUT)
 for _ in range(25):
  try:
   status,result=request('/functions/v1/stripe-env-gate',b'{}',{'Authorization':'Bearer '+CFG['SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
   if status==200 and result.get('fingerprint_match'):return
  except OSError:pass
  time.sleep(1)
 raise AssertionError('Paired Edge environment not ready')
def wait_state(eid,states):
 for _ in range(50):
  row=inbox(eid)
  if row and row['state'] in states:return row
  if row and row['state']=='received' and eid in events:send(events[eid][1])
  time.sleep(.2)
 raise AssertionError('Expected inbox disposition not reached')
def wait_completed(eid):
 for _ in range(30):
  row=inbox(eid)
  if row and row['state']=='completed':return
  if row and row['state']=='received' and eid in events:send(events[eid][1])
  time.sleep(.2)
 raise AssertionError('Genuine event did not reach completed state')
fixtures={}
try:
 assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic initial worker F ingress')")
 context=json.loads((ROOT/'stripe-test-context.json').read_text());assert context['livemode'] is False
 assert stripe('get','/v1/account')['id']==context['account_id']
 server=http.server.ThreadingHTTPServer(('0.0.0.0',59421),Capture);threading.Thread(target=server.serve_forever,daemon=True).start()
 wrapper="""if (import.meta.main) Deno.serve(async(req)=>{
 const copy=req.clone();await fetch('http://host.docker.internal:59421/capture',{method:'POST',headers:{'x-tt-staging-nonce':'NONCE','stripe-signature':req.headers.get('stripe-signature')||''},body:await copy.arrayBuffer()});
 return handleStripeWebhook(req);
 });""".replace('NONCE',nonce)
 shim="""const savedFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{
 const url=input instanceof Request?input.url:String(input);
 if(url.includes('/rpc/finish_lifecycle_work')) await savedFetch('http://host.docker.internal:59421/control/finish',{headers:{'x-tt-staging-nonce':'NONCE'}});
 return savedFetch(input,init);
 };""".replace('NONCE',nonce)
 served.write_text(shim+original.replace('if (import.meta.main) Deno.serve(handleStripeWebhook);',wrapper));restart_edge()
 code,user=request('/auth/v1/admin/users',json.dumps({'email':'worker-f-'+uuid.uuid4().hex+'@example.invalid','password':'Synthetic-Worker-123!','email_confirm':True}).encode(),{'apikey':CFG['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+CFG['SERVICE_ROLE_KEY'],'Content-Type':'application/json'});assert code==200
 uid=user['id'];customer=stripe('post','/v1/customers',{'description':'Synthetic initial worker F'})
 product=stripe('post','/v1/products',{'name':'Synthetic initial worker F'})
 sql(f"INSERT INTO public.supporters(user_id,type,tier,status,stripe_customer_id) VALUES('{uid}','subscription','scav','active','{customer['id']}')")
 sub=stripe('post','/v1/subscriptions',{'customer':customer['id'],'trial_period_days':2,'items[0][price_data][currency]':'usd','items[0][price_data][unit_amount]':100,'items[0][price_data][product]':product['id'],'items[0][price_data][recurring][interval]':'month','metadata[user_id]':uid,'metadata[tier]':'timmy'})
 event,envelope=received(sub['id'],'customer.subscription.created')
 wait_state(event['id'],['received'])
 check(inbox(event['id'])['state']=='received','genuine signed receipt persists with processing paused')
 sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE resource_id='{event['id']}'")
 env=dict(x.split('=',1) for x in pathlib.Path('/tmp/tt-b-delivery-final/edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
 def worker():
  try:return request('/functions/v1/lifecycle-worker?kind=stripe_event',b'',{'apikey':CFG['ANON_KEY'],'Authorization':'Bearer '+env['LIFECYCLE_WORKER_SECRET']})
  except (OSError,ValueError):return 0,{}
 fault='crash_finish';barrier.clear();release.clear()
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic initial worker F')")
 with concurrent.futures.ThreadPoolExecutor() as pool:
  pending=pool.submit(worker);check(barrier.wait(20),'actual initial worker reaches pre-completion barrier')
  check(sql(f"SELECT tier FROM public.supporters WHERE user_id='{uid}'")=='timmy','initial worker committed entitlement before completion')
  durable=sql(f"SELECT to_jsonb(s)-'updated_at' FROM public.supporters s WHERE user_id='{uid}'")
  claim=json.loads(sql(f"SELECT jsonb_build_object('id',id,'token',claim_token,'invocation',delivery_invocation) FROM private.lifecycle_work WHERE resource_id='{event['id']}'"))
  header=json.dumps({'x-lifecycle-delivery':claim['invocation']})
  sql(f"BEGIN; SET LOCAL request.headers='{header}'; UPDATE private.lifecycle_work SET lease_until=clock_timestamp()+interval '1 second' WHERE id='{claim['id']}'; COMMIT;")
  subprocess.run(['docker','kill','supabase_edge_runtime_tt-b-http-disposable'],check=True,stdout=subprocess.DEVNULL)
  check(subprocess.check_output(['docker','inspect','supabase_edge_runtime_tt-b-http-disposable','--format','{{.State.Running}}'],text=True).strip()=='false','initial worker process death verified')
  release.set();pending.result(timeout=35)
 fault=None;served.write_text(original);restart_edge()
 start=time.monotonic()
 while sql(f"SELECT public.lifecycle_delivery_valid('{claim['invocation']}')")=='t':
  assert time.monotonic()-start<40;time.sleep(.2)
 code,result=worker();check(code==200 and result['result']=={'examined':1,'completed':1},'replacement worker completes exactly one inbox item')
 check(sql(f"SELECT to_jsonb(s)-'updated_at' FROM public.supporters s WHERE user_id='{uid}'")==durable,'reconciliation preserves committed entitlement and totals')
 check(inbox(event['id'])['state']=='completed','inbox completion persisted')
 stale=subprocess.run(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],input=f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='{header}'; SELECT public.finish_lifecycle_work('{claim['id']}','{claim['token']}','completed'); COMMIT;",text=True,capture_output=True)
 check(stale.returncode!=0 and 'expired' in stale.stderr,'stale initial worker completion denied')
 check(sql(f"SELECT finished_at IS NULL FROM private.lifecycle_delivery_invocations WHERE id='{claim['invocation']}'")=='t','abandoned invocation evidence retained without manual cleanup')
 print(json.dumps({'scenario':'F initial lifecycle-worker local-effect death','passed':len(results),'provider':'real Stripe TEST','task_expiry':'synthetic shortening','invocation_expiry':'natural DB time','production_changes':0}))
finally:
 release.set();fault=None;served.write_text(original);sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic initial worker F finished')")
 if server:server.shutdown();server.server_close()
 restart_edge()
