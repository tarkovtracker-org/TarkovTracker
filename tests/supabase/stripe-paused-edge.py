"""Genuine Stripe CLI signed ingress while processing is paused; synthetic TEST MODE only."""
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
class Capture(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  if not hmac.compare_digest(self.headers.get('x-test-nonce',''),nonce):self.send_response(403);self.end_headers();return
  n=int(self.headers.get('Content-Length','0'))
  if not 0<n<1048576:self.send_response(400);self.end_headers();return
  body=self.rfile.read(n);event=json.loads(body)
  if event.get('livemode') is not False:self.send_response(400);self.end_headers();return
  with condition:events[event['id']]=(event,(body,self.headers.get('stripe-signature','')));condition.notify_all()
  self.send_response(200);self.end_headers()
def restart():
 if (OUT/'edge-process.json').exists():
  pid=json.loads((OUT/'edge-process.json').read_text())['pid']
  try:os.kill(pid,signal.SIGINT)
  except ProcessLookupError:pass
 subprocess.run(['docker','stop','supabase_edge_runtime_tt-b-http-disposable'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 log=(OUT/'edge-runtime-private.log').open('a')
 p=subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir','/tmp/tt-b-http','--import-map','/tmp/tt-b-http/supabase/functions/deno.json','--env-file',str(OUT/'edge.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (OUT/'edge-process.json').write_text(json.dumps({'pid':p.pid,'local':True}))
 for _ in range(40):
  try:
   status,result=request('/functions/v1/stripe-env-gate',b'{}',{'Authorization':'Bearer '+cfg['SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
   if status==200 and result.get('fingerprint_match'):return
  except OSError:pass
  time.sleep(.25)
 raise AssertionError('Local pairing gate failed; no provider fixtures sent')
def received(subid):
 deadline=time.monotonic()+40
 with condition:
  while time.monotonic()<deadline:
   for e,envelope in events.values():
    if e['type']=='customer.subscription.created' and e['data']['object'].get('id')==subid:return e,envelope
   condition.wait(timeout=.25)
 raise AssertionError('Genuine CLI delivery not captured')
served=pathlib.Path('/tmp/tt-b-http/supabase/functions/stripe-webhook/index.ts');original=served.read_text();assert original==(ROOT/'supabase/functions/stripe-webhook/index.ts').read_text()
server=http.server.ThreadingHTTPServer(('0.0.0.0',59421),Capture);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 anchor='if (import.meta.main) Deno.serve(handleStripeWebhook);';assert original.count(anchor)==1
 wrapper="""if (import.meta.main) Deno.serve(async(req)=>{if(req.method==='POST'){const copy=req.clone();await fetch('http://host.docker.internal:59421/capture',{method:'POST',headers:{'x-test-nonce':'__NONCE__','stripe-signature':req.headers.get('stripe-signature')||''},body:await copy.arrayBuffer()});}return handleStripeWebhook(req);});""".replace('__NONCE__',nonce)
 served.write_text(original.replace(anchor,wrapper));restart()
 check(True,'active local runtime signing-secret pairing verified without values')
 account=stripe('get','/v1/account');assert account['id']==context['account_id'];del account
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic-signed-pause');")
 status,user=request('/auth/v1/admin/users',json.dumps({'email':'paused-'+uuid.uuid4().hex+'@example.invalid','password':'Synthetic-Paused-123!','email_confirm':True}).encode(),{'apikey':cfg['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+cfg['SERVICE_ROLE_KEY'],'Content-Type':'application/json'});assert status==200
 customer=stripe('post','/v1/customers',{'source':'tok_visa','description':'Synthetic Package B pause validation'})
 product=stripe('post','/v1/products',{'name':'Synthetic Package B pause validation'})
 sql(f"INSERT INTO public.supporters(user_id,type,tier,status,stripe_customer_id) VALUES('{user['id']}','subscription','scav','active','{customer['id']}')")
 subscription=stripe('post','/v1/subscriptions',{'customer':customer['id'],'items[0][price_data][currency]':'usd','items[0][price_data][unit_amount]':100,'items[0][price_data][product]':product['id'],'items[0][price_data][recurring][interval]':'month','metadata[user_id]':user['id'],'metadata[tier]':'scav'})
 event,envelope=received(subscription['id']);eid=event['id']
 status,response=send(envelope)
 check(status==202 and response.get('received') and response.get('completed') is False,'genuine signed receipt accepted while processing paused')
 check(sql(f"SELECT state='received' AND attempts=0 FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")=='t','receipt persists without claim or effect')
 check(sql(f"SELECT stripe_subscription_id IS NULL FROM public.supporters WHERE user_id='{user['id']}'")=='t','paused event has no subscription-link application effect')
 check(send(envelope)[0]==202,'duplicate genuine signed receipt remains accepted')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")=='1','duplicate creates exactly one inbox item')
 for changed in ['body','wrong-secret','missing']:check(send(envelope,changed)[0]==401,changed+' signature rejected through real Edge')
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic-signed-resume');")
 status,response=send(envelope)
 check(status==200 and response.get('completed') is True,'manual staging resume processes genuine previously paused receipt')
 check(sql(f"SELECT stripe_subscription_id='{subscription['id']}' FROM public.supporters WHERE user_id='{user['id']}'")=='t','real Stripe provider truth updates application after resume')
 attempts=sql(f"SELECT attempts FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")
 check(send(envelope)[0]==200,'completed duplicate acknowledged')
 check(sql(f"SELECT attempts FROM private.lifecycle_work WHERE dedupe_key='{eid}' AND kind='stripe_event'")==attempts,'completed event not reprocessed')
 f=OUT/'paused-stripe-fixtures-RESTRICTED.json';f.write_text(json.dumps({'user':user['id'],'customer':customer['id'],'subscription':subscription['id'],'product':product['id'],'event':eid}));f.chmod(0o600)
 print(json.dumps({'passed':len(results),'signature':'genuine Stripe CLI','provider':'real Stripe TEST MODE','negative_signature':'controlled wrong secret','production_changes':0}))
finally:
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic-signed-finished');")
 served.write_text(original);server.shutdown();server.server_close();restart()
