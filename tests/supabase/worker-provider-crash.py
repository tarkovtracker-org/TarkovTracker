"""Real TEST Stripe effect + actual Edge death before completion (E).
Task lease shortening is controlled synthetic fault injection; invocation expiry is natural.
No secrets/provider payloads printed. No production resources or cleanup.
"""
import sys,concurrent.futures,http.server,json,os,pathlib,secrets,signal,subprocess,threading,time,urllib.request,urllib.error,uuid
MODE=sys.argv[1] if len(sys.argv)>1 else 'E';assert MODE in ('B','C','D','E','G')
ROOT=pathlib.Path(__file__).resolve().parents[2];STAGE=pathlib.Path('/tmp/tt-b-http');OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable';EDGE='supabase_edge_runtime_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres' and cfg['API_URL']=='http://127.0.0.1:59321'
l=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert l['com.supabase.cli.workdir']==str(STAGE)
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_') and env['DISCORD_BOT_TOKEN']=='synthetic-discord-no-external-access'
auth=json.loads(subprocess.check_output(['stripe','whoami','--format','json']));assert auth['authenticated'];del auth
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def stripe(method,path,params=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (params or {}).items():args+=['-d',k+'='+str(v)]
 p=subprocess.run(args,text=True,capture_output=True,timeout=45)
 assert p.returncode==0,'Stripe TEST request failed (response withheld)'
 obj=json.loads(p.stdout);assert 'error' not in obj
 if 'livemode' in obj:assert obj['livemode'] is False
 return obj
# Default Stripe CLI mode is test; every resource response must independently confirm it.
mode=stripe('get','/v1/balance');assert mode['livemode'] is False
nonce=secrets.token_hex(24);reached=threading.Event();release=threading.Event();counts={'POST':0,'GET':0};result={}
class Barrier(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if not secrets.compare_digest(self.headers.get('x-nonce',''),nonce):self.send_response(403);self.end_headers();return
  if self.path=='/finish':reached.set();release.wait(45)
  elif self.path=='/post':counts['POST']+=1
  elif self.path=='/get':counts['GET']+=1
  self.send_response(200);self.end_headers()
server=http.server.ThreadingHTTPServer(('0.0.0.0',59425),Barrier);threading.Thread(target=server.serve_forever,daemon=True).start()
source=STAGE/'supabase/functions/lifecycle-worker/index.ts';original=(ROOT/'supabase/functions/lifecycle-worker/index.ts').read_text();assert source.read_text()==original
secret=env['LIFECYCLE_WORKER_SECRET']
def call(key=None):
 headers={'apikey':cfg['ANON_KEY']}
 if key:headers['Authorization']='Bearer '+key
 req=urllib.request.Request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=stripe_cleanup',data=b'',headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=55) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read())
 except (OSError,ValueError):return 0,{}
def restart():
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().decode().split('\0')
   if 'functions' in args and 'serve' in args and str(STAGE) in args:os.kill(int(p.name),signal.SIGINT)
  except (OSError,UnicodeError):pass
 subprocess.run(['docker','stop',EDGE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 log=(OUT/'worker-provider-crash-RESTRICTED.log').open('a');os.chmod(log.name,0o600)
 subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir',str(STAGE),'--import-map',str(STAGE/'supabase/functions/deno.json'),'--env-file',str(OUT/'edge.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 for _ in range(50):
  if call()[0]==401:return
  time.sleep(.2)
 raise AssertionError('Local Edge startup failed')
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
try:
 customer=stripe('post','/v1/customers',{'description':'Synthetic Package B invocation expiry test'})
 product=stripe('post','/v1/products',{'name':'Synthetic Package B invocation expiry test'})
 sub=stripe('post','/v1/subscriptions',{'customer':customer['id'],'trial_period_days':2,'items[0][price_data][currency]':'usd','items[0][price_data][unit_amount]':100,'items[0][price_data][product]':product['id'],'items[0][price_data][recurring][interval]':'month'})
 assert sub['status']=='trialing' and not sub['cancel_at_period_end']
 task=str(uuid.uuid4());sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,action,resource_id) VALUES('{task}','stripe_cleanup','synthetic-effect-{task}','cancel_at_period_end','{sub['id']}'); UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 shim="""const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=input instanceof Request?input.url:String(input);
 const method=init?.method??(input instanceof Request?input.method:'GET');
 const mark=async(stage)=>{await actualFetch('http://host.docker.internal:59425/'+stage,{headers:{'x-nonce':'NONCE'}});};
 if(url.includes('/rpc/finish_lifecycle_work')) await mark('finish');
 if(url.startsWith('https://api.stripe.com/')) {
  if(method!=='GET' && !(method==='POST' && url.includes('/subscriptions/'))) throw new Error('Unexpected provider mutation');
  const response=await actualFetch(input,init);await mark(method==='POST'?'post':'get');return response;
 }
 if(url.includes('discord.com/')) throw new Error('Discord forbidden');
 return actualFetch(input,init);
};
""".replace('NONCE',nonce)
 active_shim=shim
 if MODE=='D':active_shim=shim.replace("if(url.includes('/rpc/finish_lifecycle_work')) await mark('finish');",'').replace("await mark(method==='POST'?'post':'get');return response;","await mark(method==='POST'?'post':'get');if(method==='POST') throw new TypeError('Controlled lost success response');return response;")
 if MODE in ('B','C'):
  active_shim=shim.replace("if(url.includes('/rpc/finish_lifecycle_work')) await mark('finish');",'')
  if MODE=='B':active_shim=active_shim.replace("if(url.startsWith('https://api.stripe.com/'))","if(url.includes('/rpc/claim_lifecycle_work')) {const response=await actualFetch(input,init);await mark('finish');return response;} if(url.startsWith('https://api.stripe.com/'))")
  else:active_shim=active_shim.replace("const response=await actualFetch(input,init);await mark","if(method==='POST') await mark('finish');const response=await actualFetch(input,init);await mark")
 if MODE=='G':
  active_shim=shim.replace("const actualFetch=globalThis.fetch;", "const actualFetch=globalThis.fetch;let firstInvocation;")
  active_shim=active_shim.replace("if(url.includes('/rpc/finish_lifecycle_work')) await mark('finish');", "if(url.includes('/rpc/begin_lifecycle_delivery')) {const response=await actualFetch(input,init);firstInvocation??=await response.clone().json();return response;} if(url.includes('/rpc/renew_lifecycle_delivery') && JSON.parse(init.body).p_invocation===firstInvocation) return Response.json(false);")
  active_shim=active_shim.replace("await mark(method==='POST'?'post':'get');return response;", "await mark(method==='POST'?'post':'get');if(method==='POST') await mark('finish');return response;")
 source.write_text(active_shim+original);restart();sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic effect crash')")
 if MODE!='D':
  with concurrent.futures.ThreadPoolExecutor() as pool:
   future=pool.submit(call,secret);assert reached.wait(40),'Completion barrier not reached'
   assert counts['POST']==(1 if MODE in ('E','G') else 0),'Expected provider boundary before crash'
   current=stripe('get','/v1/subscriptions/'+sub['id']);assert current['cancel_at_period_end']==(MODE in ('E','G')) and current['status']=='trialing'
   invocation=sql(f"SELECT delivery_invocation FROM private.lifecycle_work WHERE id='{task}'");token=sql(f"SELECT claim_token FROM private.lifecycle_work WHERE id='{task}'")
   assert sql(f"SELECT state FROM private.lifecycle_work WHERE id='{task}'")=='processing'
   header=json.dumps({'x-lifecycle-delivery':invocation})
   sql(f"BEGIN; SET LOCAL request.headers='{header}'; UPDATE private.lifecycle_work SET lease_until=clock_timestamp()+interval '1 second' WHERE id='{task}'; COMMIT;")
   if MODE=='G':
    start=time.monotonic()
    while sql(f"SELECT public.lifecycle_delivery_valid('{invocation}')")=='t':
     assert time.monotonic()-start<40;time.sleep(.2)
    before=counts['POST'];code,body=call(secret)
    release.set();old_code,_=future.result(timeout=60);assert old_code==503,'Stale invocation must report incomplete, not success'
   else:
    subprocess.run(['docker','kill',EDGE],stdout=subprocess.DEVNULL,check=True);release.set();future.result(timeout=60)
 else:
  code,body=call(secret);assert code==200 and body['result']=={'claimed':1,'advanced':1}
  assert counts['POST']==1 and sql(f"SELECT state FROM private.lifecycle_work WHERE id='{task}'")=='retryable'
  current=stripe('get','/v1/subscriptions/'+sub['id']);assert current['cancel_at_period_end']
  invocation=sql(f"SELECT delivery_invocation FROM private.lifecycle_work WHERE id='{task}'")
  token=str(uuid.uuid4());header=json.dumps({'x-lifecycle-delivery':invocation})
  sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 if MODE!='G':
  # Keep request counting, remove only the completion interruption.
  source.write_text(shim.replace("if(url.includes('/rpc/finish_lifecycle_work')) await mark('finish');",'')+original);restart()
  start=time.monotonic()
  while sql(f"SELECT public.lifecycle_delivery_valid('{invocation}')")=='t':
   assert time.monotonic()-start<40;time.sleep(.2)
  before=counts['POST'];code,body=call(secret)
 assert code==200 and body['result']=={'claimed':1,'advanced':1},'Restart must reconcile one task'
 assert counts['POST']==before+(1 if MODE in ('B','C') else 0),'Retry issues only a not-yet-achieved cancellation'
 assert sql(f"SELECT state='waiting' AND claim_token IS NULL FROM private.lifecycle_work WHERE id='{task}'")=='t'
 stale=subprocess.run(CMD,input=f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='{header}'; SELECT public.finish_lifecycle_work('{task}','{token}','completed'); COMMIT;",text=True,capture_output=True)
 assert stale.returncode!=0 and 'expired' in stale.stderr
 current=stripe('get','/v1/subscriptions/'+sub['id']);assert current['status']=='trialing' and current['cancel_at_period_end']
 result={'scenario':MODE+' real provider effect recovery','result':'PASS','provider_mode':'TEST','provider_post_count':counts['POST'],'provider_get_count':counts['GET'],'final_task':'waiting for confirmed subscription end','stale_completion':'DENIED','invocation_expiry':'natural database time' if MODE!='D' else 'normal release','task_expiry':'controlled synthetic shortening' if MODE!='D' else 'retry time advanced synthetically','refund_credit_customer_delete_calls':0,'production_changes':0}
 print(json.dumps(result))
finally:
 release.set();source.write_text(original);sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic provider crash complete')");server.shutdown();restart();(OUT/('worker-provider-crash-'+MODE+'-result.json')).write_text(json.dumps(result,indent=2)+'\n')
