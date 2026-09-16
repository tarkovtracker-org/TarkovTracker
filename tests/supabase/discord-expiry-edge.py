"""Real local Edge/DB with synchronized HTTP Discord simulation; never contacts Discord.
Invocation expiry uses database time; only synthetic task expiry is shortened under its owner.
"""
import concurrent.futures,http.server,json,os,pathlib,secrets,signal,subprocess,threading,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]; STAGE=pathlib.Path('/tmp/tt-b-http'); OUT=pathlib.Path('/tmp/tt-b-delivery-final')
C='supabase_db_tt-b-http-disposable'; EDGE='supabase_edge_runtime_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text())
assert cfg['API_URL']=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']==str(STAGE)
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'))
assert env['DISCORD_BOT_TOKEN']=='synthetic-discord-no-external-access'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
secret=env['LIFECYCLE_WORKER_SECRET']; nonce=secrets.token_hex(24); reached=threading.Event(); release=threading.Event()
state={'mode':'ambiguous','calls':0,'removed':set(),'effects':0}; checks=[]
def check(value,label):
 assert value,label
 checks.append(label);print('PASS '+label,flush=True)
class Discord(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_DELETE(self):
  if not secrets.compare_digest(self.headers.get('x-test-nonce',''),nonce):self.send_response(403);self.end_headers();return
  state['calls']+=1; mode=state['mode']; first=self.path not in state['removed']
  if mode=='ambiguous':
   if first:state['removed'].add(self.path);state['effects']+=1
   if state['calls']==1:reached.set();release.wait(50)
   code=204 if first else 404;body={} if first else {'code':10011}
  elif mode=='429':code=429;body={'retry_after':2}
  elif mode=='500':code=500;body={'message':'synthetic unavailable'}
  elif mode=='timeout':time.sleep(11);code=204;body={}
  else:code=404;body={'code':10007 if mode=='member_absent' else 10011}
  try:
   self.send_response(code);self.send_header('Content-Type','application/json')
   if code==429:self.send_header('Retry-After','2')
   self.end_headers()
   if code!=204:self.wfile.write(json.dumps(body).encode())
  except (BrokenPipeError,ConnectionResetError):pass
server=http.server.ThreadingHTTPServer(('0.0.0.0',59429),Discord);threading.Thread(target=server.serve_forever,daemon=True).start()
source=STAGE/'supabase/functions/lifecycle-worker/index.ts';original=(ROOT/'supabase/functions/lifecycle-worker/index.ts').read_text();assert source.read_text()==original
shim="""const originalFetch=globalThis.fetch;let firstInvocation;
globalThis.fetch=async(input,init)=>{
 const url=input instanceof Request?input.url:String(input);
 if(url.includes('/rpc/begin_lifecycle_delivery')) {const response=await originalFetch(input,init);firstInvocation??=await response.clone().json();return response;}
 if(url.includes('/rpc/renew_lifecycle_delivery') && JSON.parse(init.body).p_invocation===firstInvocation) return Response.json(false);
 if(url.startsWith('https://discord.com/')) {const headers=new Headers(init?.headers);headers.delete('Authorization');headers.set('x-test-nonce','NONCE');return originalFetch('http://host.docker.internal:59429'+new URL(url).pathname,{...init,headers,signal:undefined});}
 if(url.startsWith('https://api.stripe.com/')) throw new Error('Stripe forbidden');
 return originalFetch(input,init);
};
""".replace('NONCE',nonce)
def call(key=None):
 headers={'apikey':cfg['ANON_KEY']}
 if key:headers['Authorization']='Bearer '+key
 try:
  with urllib.request.urlopen(urllib.request.Request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=discord_cleanup',data=b'',headers=headers),timeout=55) as r:return r.status,json.loads(r.read())
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
 log=(OUT/'discord-expiry-edge-RESTRICTED.log').open('a');os.chmod(log.name,0o600)
 subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir',str(STAGE),'--import-map',str(STAGE/'supabase/functions/deno.json'),'--env-file',str(OUT/'edge.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 for _ in range(50):
  if call()[0]==401:return
  time.sleep(.2)
 raise AssertionError('Local Edge startup failed')
def task():
 uid=str(uuid.uuid4());sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,action,resource_id) VALUES('{uid}','discord_cleanup','synthetic-discord-{uid}','remove_roles','synthetic-identity'); UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{uid}'")
 return uid
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
assert sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t'
try:
 source.write_text(shim+original);restart();target=task();sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic Discord expiry test')")
 with concurrent.futures.ThreadPoolExecutor() as pool:
  old=pool.submit(call,secret);check(reached.wait(15),'first removal accepted by synchronized mock')
  invocation=sql(f"SELECT delivery_invocation FROM private.lifecycle_work WHERE id='{target}'");token=sql(f"SELECT claim_token FROM private.lifecycle_work WHERE id='{target}'")
  header=json.dumps({'x-lifecycle-delivery':invocation})
  sql(f"BEGIN; SET LOCAL request.headers='{header}'; UPDATE private.lifecycle_work SET lease_until=clock_timestamp()+interval '1 second' WHERE id='{target}'; COMMIT;")
  # A second obligation is independently durable while the first response is delayed.
  newer=task();sql(f"UPDATE private.lifecycle_work SET available_at=clock_timestamp()+interval '1 hour' WHERE id='{newer}'")
  started=time.monotonic()
  while sql(f"SELECT public.lifecycle_delivery_valid('{invocation}')")=='t':
   assert time.monotonic()-started<40;time.sleep(.2)
  code,body=call(secret);check(code==200 and body['result']=={'claimed':1,'advanced':1},'replacement reconciles one cleanup after natural invocation expiry')
  check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{target}'")=='completed','old obligation completed once')
  check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{newer}'")=='received','new obligation not completed by another worker')
  release.set();check(old.result(timeout=20)[0]==503,'stale worker reports incomplete after delayed response')
 stale=subprocess.run(CMD,input=f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='{header}'; SELECT public.finish_lifecycle_work('{target}','{token}','completed'); COMMIT;",text=True,capture_output=True)
 check(stale.returncode!=0 and 'expired' in stale.stderr,'stale invocation completion denied')
 check(state['effects']==len(set([env[k] for k in ['DISCORD_LINKED_ROLE_ID','DISCORD_SUPPORTER_ROLE_ID','DISCORD_SCAV_ROLE_ID','DISCORD_TIMMY_ROLE_ID','DISCORD_CHAD_ROLE_ID']])),'repeated removal causes no second external effect')
 # Remove only ambiguity/renewal injection; ordinary timeout signal is honored below.
 safe=shim.replace("if(url.includes('/rpc/renew_lifecycle_delivery') && JSON.parse(init.body).p_invocation===firstInvocation) return Response.json(false);",'').replace(',signal:undefined','')
 source.write_text(safe+original);restart()
 for mode in ['429','500','timeout','role_absent','member_absent']:
  state['mode']=mode;t=task();started=time.monotonic();code,body=call(secret);elapsed=time.monotonic()-started
  expected='retryable' if mode in ['429','500','timeout'] else 'completed'
  check(code==200 and body['result']=={'claimed':1,'advanced':1} and sql(f"SELECT state FROM private.lifecycle_work WHERE id='{t}'")==expected,mode+' actual Edge response classification')
  check(elapsed<20,mode+' bounded invocation')
  if mode=='429':check(sql(f"SELECT available_at>clock_timestamp() FROM private.lifecycle_work WHERE id='{t}'")=='t','Retry-After persisted')
 print(json.dumps({'passed':len(checks),'provider':'synchronized Discord HTTP simulation','invocation_expiry':'natural DB time','task_expiry':'synthetic shortening','production_changes':0}),flush=True)
finally:
 release.set();source.write_text(original);sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic Discord test complete')");server.shutdown();restart()
