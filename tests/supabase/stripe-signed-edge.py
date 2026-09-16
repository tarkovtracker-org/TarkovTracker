"""Genuine CLI-signed test events through unchanged local Edge. No secret values read.
CLI authentication is operator configured. Signed envelopes stay in memory only.
"""
import http.server,threading,subprocess,json,pathlib,urllib.request,urllib.error,time,uuid,os,secrets,hmac,re
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
fixtures={};deferred=None
try:
 assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0','Start without uncertain active invocations'
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic signed F5 validation')")
 # Bounded metadata read verifies CLI account without requesting live-mode resources.
 context=json.loads((ROOT/'stripe-test-context.json').read_text());assert context['livemode'] is False
 account=stripe('get','/v1/account');assert account['id']==context['account_id']
 server=http.server.ThreadingHTTPServer(('0.0.0.0',59421),Capture);threading.Thread(target=server.serve_forever,daemon=True).start()
 # Instrument only a clone at the disposable HTTP ingress; the actual candidate
 # still receives the original Request and performs its own raw-body verification.
 wrapper="""if (import.meta.main) Deno.serve(async (req) => {
   if (req.method === 'POST') {
     const copy=req.clone();
     await fetch('http://host.docker.internal:59421/capture', { method:'POST',
       headers:{'x-tt-staging-nonce':'__NONCE__','stripe-signature':req.headers.get('stripe-signature') || ''},
       body:await copy.arrayBuffer() });
   }
   return handleStripeWebhook(req);
 });"""
 shim="""const __realFetch=globalThis.fetch;
 globalThis.fetch=async (input,init) => {
   const url=String(input);
   if(url.startsWith('https://api.stripe.com/')) {
     const probe=await __realFetch('http://host.docker.internal:59421/control/stripe',{headers:{'x-tt-staging-nonce':'__NONCE__'}});
     const {mode}=await probe.json();
     if(mode==='network') throw new TypeError('controlled provider transport failure');
     if(mode==='malformed') return new Response('not json',{status:200,headers:{'content-type':'application/json'}});
     if(typeof mode==='number') return Response.json({error:{type:'api_error'}},{status:mode,headers:{'retry-after':'1'}});
   }
   if(url.includes('/rest/v1/rpc/receive_stripe_lifecycle')) {const response=await __realFetch(input,init);await __realFetch('http://host.docker.internal:59421/control/receipt',{headers:{'x-tt-staging-nonce':'__NONCE__'}});return response;}
   if(url.includes('/rest/v1/rpc/finish_lifecycle_work')) await __realFetch('http://host.docker.internal:59421/control/finish',{headers:{'x-tt-staging-nonce':'__NONCE__'}});
   return __realFetch(input,init);
 };
 """
 served.chmod(0o600)
 shim=shim.replace('__NONCE__',nonce);wrapper=wrapper.replace('__NONCE__',nonce)
 anchor='if (import.meta.main) Deno.serve(handleStripeWebhook);'
 assert original.count(anchor)==1,'Expected exactly one candidate HTTP entrypoint anchor'
 served.write_text(shim+original.replace(anchor,wrapper))
 restart_edge()
 if os.environ.get('TT_B_STRIPE_RESUME')=='1':
  fixtures=json.loads((ROOT/'stripe-signed-fixtures.json').read_text())
  uid=fixtures['user_id'];clock={'id':fixtures['clock']};customer={'id':fixtures['customer']};product={'id':fixtures['product']}
  sub=stripe('get','/v1/subscriptions/'+fixtures['subscription']);assert sub['status']=='active'
  stripe('post','/v1/subscriptions/'+sub['id'],{'metadata[resume]':uuid.uuid4().hex})
  initial_kind='customer.subscription.updated'
 else:
  uid_body={'email':'stripe-edge-'+uuid.uuid4().hex+'@example.invalid','password':'Synthetic-Stripe-123!','email_confirm':True}
  code,user=request('/auth/v1/admin/users',json.dumps(uid_body).encode(),{'apikey':CFG['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+CFG['SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
  check(code==200,'synthetic user created through supported local Auth')
  uid=user['id'];clock=stripe('post','/v1/test_helpers/test_clocks',{'frozen_time':int(time.time()),'name':'Package B signed Edge synthetic clock'})
  customer=stripe('post','/v1/customers',{'test_clock':clock['id'],'source':'tok_visa','description':'Package B signed Edge synthetic customer'})
  product=stripe('post','/v1/products',{'name':'Package B signed Edge synthetic plan'})
  sql(f"INSERT INTO public.supporters(user_id,type,tier,status,stripe_customer_id) VALUES('{uid}','subscription','scav','active','{customer['id']}')")
  sub=stripe('post','/v1/subscriptions',{'customer':customer['id'],'items[0][price_data][currency]':'usd','items[0][price_data][unit_amount]':100,'items[0][price_data][product]':product['id'],'items[0][price_data][recurring][interval]':'month','metadata[user_id]':uid,'metadata[tier]':'scav'})
  fixtures={'user_id':uid,'clock':clock['id'],'customer':customer['id'],'subscription':sub['id'],'product':product['id']}
  initial_kind='customer.subscription.created'
 event,envelope=received(sub['id'],initial_kind)
 wait_completed(event['id'])
 status,response=send(envelope)
 print(json.dumps({'initial_http_status':status,'completed':response.get('completed'),'error_class':response.get('error'),'inbox':inbox(event['id'])}),flush=True)
 check(status==200 and response.get('completed') is True,'genuine Stripe-signed HTTP event accepted and completed by actual Edge')
 check(inbox(event['id'])['state']=='completed','signed event completion persisted')
 for change in ['invalid','missing','body']:
  check(send(envelope,change)[0]==401,change+' signature/raw-body tampering rejected by actual Edge')
 check(send(envelope)[0]==200,'duplicate genuine signed delivery accepted idempotently')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE resource_id='{event['id']}'")=='1','duplicate creates one inbox item')
 check(sql(f"SELECT stripe_subscription_id='{sub['id']}' AND status='active' FROM public.supporters WHERE user_id='{uid}'")=='t','actual Stripe lookup and application entitlement effect persisted')
 old=set(events);stripe('post','/v1/subscriptions/'+sub['id'],{'cancel_at_period_end':'true','metadata[pending_probe]':uuid.uuid4().hex})
 updated,updated_envelope=received(sub['id'],'customer.subscription.updated',old)
 wait_completed(updated['id'])
 check(send(updated_envelope)[0]==200,'genuine scheduled-cancellation event processed')
 current=stripe('get','/v1/subscriptions/'+sub['id']);check(current['status']=='active' and current['cancel_at_period_end'],'provider remains active while cancellation pending')
 check(sql(f"SELECT count(*) FROM auth.users WHERE id='{uid}'")=='1','local Auth intact while Stripe remains active')
 # Controlled provider faults execute through the real signed Edge handler.
 for injected in [429,503,'network','malformed',404]:
  fault=injected;old=set(events)
  stripe('post','/v1/subscriptions/'+sub['id'],{'metadata[fault_probe]':uuid.uuid4().hex})
  failed,failed_envelope=received(sub['id'],'customer.subscription.updated',old)
  row=wait_state(failed['id'],['retryable','blocked','dead_letter'])
  check(row['state']!='completed',str(injected)+' provider fault cannot complete actual Edge event')
  fault=None
  if row['state']=='retryable':
   sql(f"UPDATE private.lifecycle_work SET available_at=clock_timestamp() WHERE resource_id='{failed['id']}'")
   check(send(failed_envelope)[0]==200,str(injected)+' signed retry reconciles real Stripe truth')
 # Actual process termination at provider-lookup / completion barriers.
 for point in ['crash_receipt','crash_stripe','crash_finish']:
  fault=point;barrier.clear();release.clear();old=set(events)
  stripe('post','/v1/subscriptions/'+sub['id'],{'metadata[crash_probe]':uuid.uuid4().hex,'metadata[tier]':'timmy'})
  crashed,crashed_envelope=received(sub['id'],'customer.subscription.updated',old)
  check(barrier.wait(timeout=10),point+' explicit interruption barrier reached')
  expected='received' if point=='crash_receipt' else 'processing'
  check(inbox(crashed['id'])['state']==expected,point+' durable state exists before termination')
  if point=='crash_finish':check(sql(f"SELECT tier FROM public.supporters WHERE user_id='{uid}'")=='timmy','E application effect committed before inbox completion')
  stale=sql(f"SELECT coalesce(claim_token::text,'') FROM private.lifecycle_work WHERE resource_id='{crashed['id']}'")
  check(sql("SELECT count(*) FROM pg_stat_activity WHERE usename='authenticator' AND state='idle in transaction'")=='0',point+' no open PostgREST transaction during network barrier')
  active=json.loads(sql("SELECT coalesce(json_agg(id),'[]') FROM private.lifecycle_delivery_invocations WHERE component='provider_processing' AND finished_at IS NULL AND expires_at>clock_timestamp()"))
  # Controlled task-clock shortening while the current invocation is still authoritative.
  # Invocation expiry itself is natural and never manually cleared.
  for invocation in active:
   header=json.dumps({'x-lifecycle-delivery':invocation})
   sql(f"BEGIN; SET LOCAL request.headers='{header}'; UPDATE private.lifecycle_work SET lease_until=clock_timestamp()+interval '1 second',available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE resource_id='{crashed['id']}' AND state='processing'; COMMIT;")
  subprocess.run(['docker','kill','supabase_edge_runtime_tt-b-http-disposable'],check=True,stdout=subprocess.DEVNULL)
  assert subprocess.check_output(['docker','inspect','supabase_edge_runtime_tt-b-http-disposable','--format','{{.State.Running}}'],text=True).strip()=='false'
  fault=None;release.set();restart_edge()
  for invocation in active:
   expiry_deadline=time.monotonic()+40
   while sql(f"SELECT public.lifecycle_delivery_valid('{invocation}')")=='t':
    assert time.monotonic()<expiry_deadline;time.sleep(.2)
   check(sql(f"SELECT public.renew_lifecycle_delivery('{invocation}')")=='f',point+' abandoned invocation expires without cleanup')
  if point=='crash_stripe':
   deferred=(crashed,crashed_envelope,stale)
   check(inbox(crashed['id'])['state']=='processing','B unfinished older event retained until provider state changes')
   continue
  if point=='crash_finish':
   local_env=dict(x.split('=',1) for x in pathlib.Path('/tmp/tt-b-delivery-final/edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'))
   status,body=request('/functions/v1/lifecycle-worker?kind=stripe_event',b'',{'apikey':CFG['ANON_KEY'],'Authorization':'Bearer '+local_env['LIFECYCLE_WORKER_SECRET']})
   check(status==200 and body['result']=={'examined':1,'completed':1},'F actual lifecycle-worker resumes committed application effect before inbox completion')
  else:check(send(crashed_envelope)[0]==200,point+' new worker resumes genuine signed event')
  check(inbox(crashed['id'])['state']=='completed',point+' final inbox completed')
  if stale:
   workid=sql(f"SELECT id FROM private.lifecycle_work WHERE resource_id='{crashed['id']}'")
   check(sql(f"SELECT public.finish_lifecycle_work('{workid}','{stale}','completed')")=='f','F stale worker cannot complete newer lease')
 # Advance only the synthetic test clock to the provider-confirmed period end.
 stripe('post','/v1/test_helpers/test_clocks/'+clock['id']+'/advance',{'frozen_time':current['current_period_end']+1})
 deleted,deleted_envelope=received(sub['id'],'customer.subscription.deleted')
 wait_completed(deleted['id'])
 check(send(deleted_envelope)[0]==200,'genuine Stripe test-clock subscription-ended event processed')
 check(stripe('get','/v1/subscriptions/'+sub['id'])['status']=='canceled','real Stripe confirms terminal subscription state')
 wait_completed(updated['id'])
 if deferred:
  older,older_envelope,older_token=deferred
  check(send(older_envelope)[0]==200,'B old previously unfinished signed update reconciles after newer ended event')
  check(inbox(older['id'])['state']=='completed','B resumed old event reaches correct completion')
  workid=sql(f"SELECT id FROM private.lifecycle_work WHERE resource_id='{older['id']}'")
  check(sql(f"SELECT public.finish_lifecycle_work('{workid}','{older_token}','completed')")=='f','F delayed original worker remains fenced after newer completion')
 check(send(updated_envelope)[0]==200,'out-of-order duplicate signed update is idempotent')
 check(sql(f"SELECT status FROM public.supporters WHERE user_id='{uid}'")=='expired','old signed update cannot restore ended entitlement')
 print(json.dumps({'passed':len(results),'stripe_provider':'real test mode','webhook_signature':'genuine Stripe CLI','secrets_read':False}),flush=True)
finally:
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic F5 validation finished')")
 served.write_text(original);served.chmod(original_mode)
 if server is not None:server.shutdown();server.server_close()
 if fixtures:
  p=ROOT/'stripe-signed-fixtures.json';p.write_text(json.dumps(fixtures,indent=2)+'\n');p.chmod(0o600)
 restart_edge()
