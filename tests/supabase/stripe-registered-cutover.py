"""Registered TEST MODE Stripe HTTPS ingress across the actual local Edge cutover."""
import pathlib,json,subprocess,urllib.request,urllib.error,threading,http.server,secrets,hmac,time,uuid,os,signal
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());BASE=cfg['API_URL'];assert BASE=='http://127.0.0.1:59321'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http'
env=dict(line.split('=',1) for line in (OUT/'edge.env').read_text().splitlines() if '=' in line and not line.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
auth=json.loads(subprocess.check_output(['stripe','whoami','--format','json']));assert auth['authenticated'] is True;del auth
context=json.loads(pathlib.Path('/tmp/tt-b-lifecycle-validation/stripe-test-context.json').read_text());assert context['livemode'] is False
nonce=secrets.token_urlsafe(32);events={};condition=threading.Condition();results=[]
def check(value,label):
 assert value,label
 results.append(label);print('PASS',label,flush=True)
def sql(q):return subprocess.check_output(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
def stripe(method,path,params=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (params or {}).items():args+=['-d',k+'='+str(v)]
 r=subprocess.run(args,capture_output=True,text=True,timeout=45)
 if r.returncode:raise RuntimeError('Test Stripe command failed (raw output withheld)')
 value=json.loads(r.stdout)
 assert 'error' not in value,'Test Stripe provider error (withheld)'
 if 'livemode' in value:assert value['livemode'] is False
 return value
def request(path,body,headers):
 req=urllib.request.Request(BASE+path,data=body,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'null')
def send(envelope,change=None):
 body,signature=envelope
 if change=='body':body+=b' '
 if change=='wrong-secret':
  stamp=str(int(time.time()));signature='t='+stamp+',v1='+hmac.new(b'synthetic-wrong-signing-secret',stamp.encode()+b'.'+body,'sha256').hexdigest()
 headers={'Content-Type':'application/json'}
 if change!='missing':headers['stripe-signature']=signature
 return request('/functions/v1/stripe-webhook',body,headers)
def restart():
 if (OUT/'edge-process.json').exists():
  pid=json.loads((OUT/'edge-process.json').read_text())['pid']
  try:os.kill(pid,signal.SIGINT)
  except ProcessLookupError:pass
 subprocess.run(['docker','stop','supabase_edge_runtime_tt-b-http-disposable'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 log=(OUT/'edge-runtime-private.log').open('a')
 p=subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir','/tmp/tt-b-http','--import-map','/tmp/tt-b-http/supabase/functions/deno.json','--env-file',str(OUT/'registered-webhook.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (OUT/'edge-process.json').write_text(json.dumps({'pid':p.pid,'local':True}))
 for _ in range(60):
  try:
   req=urllib.request.Request(BASE+'/functions/v1/stripe-webhook',method='GET')
   try:
    urllib.request.urlopen(req,timeout=3)
   except urllib.error.HTTPError as error:
    if error.code in [400,401,405,503]:return
  except OSError:pass
  time.sleep(.25)
 raise AssertionError('Local Edge not ready')
# Only this nonce path is exposed, and only raw POST bodies are forwarded. No Auth/admin route.
route='/stripe-b-test/'+secrets.token_urlsafe(32)
deliveries={};cond=threading.Condition()
class Forward(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.send_response(404);self.end_headers()
 def do_POST(self):
  if not hmac.compare_digest(self.path,route):self.send_response(404);self.end_headers();return
  try:n=int(self.headers.get('Content-Length','0'))
  except ValueError:n=0
  if not 0<n<1048576:self.send_response(413);self.end_headers();return
  body=self.rfile.read(n)
  try:event=json.loads(body)
  except ValueError:self.send_response(400);self.end_headers();return
  if event.get('livemode') is not False:self.send_response(400);self.end_headers();return
  signature=self.headers.get('stripe-signature','')
  try:status,result=request('/functions/v1/stripe-webhook',body,{'Content-Type':'application/json','stripe-signature':signature})
  except Exception:status,result=503,{'error':'isolated forward unavailable'}
  with cond:
   deliveries.setdefault(event['id'],[]).append({'event':event,'status':status,'result':result,'envelope':(body,signature)});cond.notify_all()
  encoded=json.dumps(result).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
def delivery(subid,expected,after=0):
 deadline=time.monotonic()+60
 with cond:
  while time.monotonic()<deadline:
   for eid,items in deliveries.items():
    for item in items[after:]:
     if item['event']['type']=='customer.subscription.created' and item['event']['data']['object'].get('id')==subid and item['status']==expected:return eid,item
   cond.wait(timeout=.25)
 raise AssertionError('Expected registered TEST webhook delivery did not arrive')
def deploy_source(bridge):
 stage=pathlib.Path('/tmp/tt-b-http/supabase/functions')
 import shutil
 for name in ['lifecycle-maintenance.ts','stripe-signature.ts']:shutil.copy2(ROOT/'supabase/functions/_shared'/name,stage/'_shared'/name)
 if bridge:
  (stage/'stripe-webhook/index.ts').write_text("import { stripeMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(stripeMaintenance(Deno.env.get('STRIPE_WEBHOOK_SECRET')));\n")
  for name in ['account-delete','account-delete-reconcile']:(stage/name/'index.ts').write_text("import { deletionMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(deletionMaintenance);\n")
 else:shutil.copy2(ROOT/'supabase/functions/stripe-webhook/index.ts',stage/'stripe-webhook/index.ts')
 restart()
def resend(eid,endpoint):
 r=subprocess.run(['stripe','events','resend',eid,'--webhook-endpoint',endpoint,'--confirm'],capture_output=True,text=True,timeout=30)
 if r.returncode:raise AssertionError('Stripe registered TEST endpoint resend failed; output withheld')
 value=json.loads(r.stdout)
 if 'error' in value:raise AssertionError('Stripe refused TEST event resend; output withheld')
 if 'livemode' in value:assert value['livemode'] is False

assert sql("SELECT to_regclass('private.lifecycle_requests') IS NULL")=='t','Begin on A+C+B0 capture only'
account=stripe('get','/v1/account');assert account['id']==context['account_id'];del account
# Verify the application's configured server key belongs to the same TEST account without output.
account_req=urllib.request.Request('https://api.stripe.com/v1/account',headers={'Authorization':'Bearer '+env['STRIPE_SECRET_KEY']})
with urllib.request.urlopen(account_req,timeout=15) as response:assert json.load(response)['id']==context['account_id']
server=http.server.ThreadingHTTPServer(('127.0.0.1',59422),Forward);threading.Thread(target=server.serve_forever,daemon=True).start()
tunnel=None;endpoint=None
try:
 configfile=OUT/'quick-tunnel.yml';configfile.write_text('no-autoupdate: true\n')
 log=(OUT/'quick-tunnel-private.log').open('w')
 tunnel=subprocess.Popen([str(OUT/'cloudflared'),'tunnel','--config',str(configfile),'--no-autoupdate','--url','http://127.0.0.1:59422','--protocol','http2'],stdout=log,stderr=subprocess.STDOUT)
 import re
 deadline=time.monotonic()+50;url=None
 while time.monotonic()<deadline:
  text=(OUT/'quick-tunnel-private.log').read_text()
  found=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',text)
  if found:url=found.group(0);break
  if tunnel.poll() is not None:raise AssertionError('Temporary HTTPS tunnel exited')
  time.sleep(.25)
 assert url,'Temporary HTTPS forwarding URL unavailable'
 check(True,'temporary HTTPS tunnel exposes only isolated webhook forwarding path')
 endpoint=stripe('post','/v1/webhook_endpoints',{'url':url+route,'enabled_events[0]':'customer.subscription.created','api_version':'2024-06-20','description':'Temporary synthetic Package B cutover validation'})
 assert endpoint['livemode'] is False
 values=dict(env);values['STRIPE_WEBHOOK_SECRET']=endpoint.pop('secret')
 localenv=OUT/'registered-webhook.env';localenv.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');localenv.chmod(0o600);del values
 (OUT/'registered-endpoint-RESTRICTED.json').write_text(json.dumps({'id':endpoint['id'],'livemode':False,'temporary':True}))
 deploy_source(True)
 check(request('/functions/v1/account-delete',b'{}',{'Content-Type':'application/json'})[0]==503,'B0 deletion intake never admits mutable work')
 check(request('/functions/v1/account-delete-reconcile',b'{}',{'Content-Type':'application/json'})[0]==503,'B0 reconciliation never admits mutable work')
 status,user=request('/auth/v1/admin/users',json.dumps({'email':'registered-'+uuid.uuid4().hex+'@example.invalid','password':'Synthetic-Registered-123!','email_confirm':True}).encode(),{'apikey':cfg['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+cfg['SERVICE_ROLE_KEY'],'Content-Type':'application/json'});assert status==200
 customer=stripe('post','/v1/customers',{'source':'tok_visa','description':'Synthetic registered endpoint validation'})
 product=stripe('post','/v1/products',{'name':'Synthetic registered endpoint validation'})
 sql(f"INSERT INTO public.supporters(user_id,type,tier,status,stripe_customer_id) VALUES('{user['id']}','subscription','scav','active','{customer['id']}')")
 subscription=stripe('post','/v1/subscriptions',{'customer':customer['id'],'items[0][price_data][currency]':'usd','items[0][price_data][unit_amount]':100,'items[0][price_data][product]':product['id'],'items[0][price_data][recurring][interval]':'month','metadata[user_id]':user['id'],'metadata[tier]':'scav'})
 eid,item=delivery(subscription['id'],503)
 check(item['result'].get('completed') is False,'genuine registered Stripe delivery verifies signature and receives retryable503')
 check(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{eid}'")=='0','B0 writes no misleading legacy receipt')
 before=len(deliveries[eid]);resend(eid,endpoint['id']);delivery(subscription['id'],503,before)
 check(True,'Stripe actually redelivers same TEST event to registered endpoint')
 check(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{eid}'")=='0','repeated maintenance delivery creates no receipt or effect')
 for changed in ['body','wrong-secret','missing']:check(send(item['envelope'],changed)[0]==401,'B0 '+changed+' rejected')
 with (OUT/'registered-final-schema.log').open('w') as log:
  r=subprocess.run([str(ROOT/'node_modules/.bin/supabase'),'db','push','--local','--skip-vault','--include-all','--yes','--workdir','/tmp/tt-b-http'],stdout=log,stderr=subprocess.STDOUT,timeout=90)
 assert r.returncode==0,'Final schema apply failed; bridge remains safe'
 before=len(deliveries[eid]);resend(eid,endpoint['id']);delivery(subscription['id'],503,before)
 check(True,'same bridge remains retry-only under final retention schema')
 check(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{eid}'")=='0','new retention never sees legacy retry-delete behavior')
 for _ in range(20):
  if sql('SELECT public.handoff_bootstrap_discord(100)')=='0':break
 else:raise AssertionError('Unexpected unbounded bootstrap backlog')
 check(sql('SELECT count(*) FROM private.lifecycle_bootstrap_discord WHERE handed_off_at IS NULL')=='0','bounded handoff preserves bootstrap obligations before reopening')
 deploy_source(False)
 before=len(deliveries[eid]);resend(eid,endpoint['id']);delivery(subscription['id'],202,before)
 check(sql(f"SELECT state='received' AND attempts=0 FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")=='t','final paused runtime durably records redelivery without effects')
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic registered cutover resume')")
 before=len(deliveries[eid]);resend(eid,endpoint['id']);delivery(subscription['id'],200,before)
 check(sql(f"SELECT state FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")=='completed','resumed real provider reconciliation completes one event')
 check(sql(f"SELECT stripe_subscription_id='{subscription['id']}' FROM public.supporters WHERE user_id='{user['id']}'")=='t','current real TEST subscription truth reaches application')
 attempts=sql(f"SELECT attempts FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")
 before=len(deliveries[eid]);resend(eid,endpoint['id']);delivery(subscription['id'],200,before)
 check(sql(f"SELECT attempts FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")==attempts,'completed registered duplicate does not repeat processing')
 print(json.dumps({'passed':len(results),'provider':'real Stripe TEST MODE','redelivery':'Stripe events resend to registered TEST HTTPS endpoint','automatic_retry_timing':'documented, not accelerated or claimed observed','production_changes':0}))
finally:
 if endpoint is not None:
  checked=stripe('get','/v1/webhook_endpoints/'+endpoint['id']);assert checked['livemode'] is False
  stripe('post','/v1/webhook_endpoints/'+endpoint['id'],{'disabled':'true'})
 if tunnel is not None:tunnel.terminate();tunnel.wait(timeout=10)
 server.shutdown();server.server_close()
 if sql("SELECT to_regclass('private.lifecycle_delivery_controls') IS NOT NULL")=='t':sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic test finished')")
 import shutil
 for name in ['account-delete','account-delete-reconcile','stripe-webhook']:shutil.copy2(ROOT/'supabase/functions'/name/'index.ts',pathlib.Path('/tmp/tt-b-http/supabase/functions')/name/'index.ts')
 # Restore the listener-paired local configuration, without exposing either secret.
 shutil.copyfile(OUT/'edge.env',OUT/'registered-webhook.env');restart()
