"""Actual local Edge death before claim, real database-clock expiry, automatic recovery.

No invocation row or lease is manually cleared/expired. Providers are never contacted: the
selected synthetic missing-identifier task must reach operator review exactly once.
"""
import sys,concurrent.futures, http.server, json, os, pathlib, secrets, signal, subprocess, threading, time, urllib.error, urllib.request, uuid
PAUSE='--pause' in sys.argv
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final')
STAGE=pathlib.Path('/tmp/tt-b-http');C='supabase_db_tt-b-http-disposable';EDGE='supabase_edge_runtime_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']==str(STAGE)
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_') and env['DISCORD_BOT_TOKEN']=='synthetic-discord-no-external-access'
secret=env['LIFECYCLE_WORKER_SECRET'];nonce=secrets.token_hex(24);barrier=threading.Event();release=threading.Event();invocation=None;dead=False;process=None
source=STAGE/'supabase/functions/lifecycle-worker/index.ts';original=source.read_text();assert original==(ROOT/'supabase/functions/lifecycle-worker/index.ts').read_text()
def sql(q):return subprocess.check_output(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
def call(credential=None):
 headers={'apikey':cfg['ANON_KEY']}
 if credential:headers['Authorization']='Bearer '+credential
 req=urllib.request.Request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=stripe_cleanup',data=b'',headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read())
 except (OSError,ValueError):return 0,{}
def stop():
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().decode().split('\0')
   if 'functions' in args and 'serve' in args and str(STAGE) in args:os.kill(int(p.name),signal.SIGINT)
  except (OSError,UnicodeError):pass
 subprocess.run(['docker','stop',EDGE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
def start():
 global process
 stop()
 log=(OUT/'worker-crash-runtime-RESTRICTED.log').open('a');os.chmod(log.name,0o600)
 process=subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir',str(STAGE),'--import-map',str(STAGE/'supabase/functions/deno.json'),'--env-file',str(OUT/'edge.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 for _ in range(40):
  if call()[0]==401:return
  time.sleep(.25)
 raise AssertionError('Disposable Edge did not start')
class Barrier(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if not secrets.compare_digest(self.headers.get('x-test-nonce',''),nonce):self.send_response(403);self.end_headers();return
  barrier.set();release.wait(45)
  self.send_response(200);self.end_headers()
server=http.server.ThreadingHTTPServer(('0.0.0.0',59423),Barrier);threading.Thread(target=server.serve_forever,daemon=True).start()
assert sql('SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()')=='0'
assert sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t'
probe=str(uuid.uuid4());result={}
try:
 sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,action,resource_id) VALUES('{probe}','stripe_cleanup','synthetic-crash-{probe}','cancel_at_period_end',NULL)")
 sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{probe}'")
 shim="""const testFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=input instanceof Request?input.url:String(input);
 if(url.includes('/rest/v1/rpc/claim_lifecycle_work')) await testFetch('http://host.docker.internal:59423/barrier',{headers:{'x-test-nonce':'NONCE'}});
 if(url.startsWith('https://api.stripe.com/') || url.includes('discord.com/')) throw new Error('Synthetic gate forbids provider HTTP');
 return testFetch(input,init);
};
""".replace('NONCE',nonce)
 source.write_text(shim+original);start()
 sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic worker crash before claim')")
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  pending=pool.submit(call,secret);assert barrier.wait(15),'Claim boundary not reached'
  invocation=sql("SELECT id FROM private.lifecycle_delivery_invocations WHERE component='provider_processing' AND finished_at IS NULL AND expires_at>clock_timestamp()");uuid.UUID(invocation)
  assert sql(f"SELECT state='received' AND attempts=0 FROM private.lifecycle_work WHERE id='{probe}'")=='t'
  if PAUSE:sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic pause after admission')")
  subprocess.run(['docker','kill',EDGE],check=True,stdout=subprocess.DEVNULL)
  dead=subprocess.check_output(['docker','inspect',EDGE,'--format','{{.State.Running}}'],text=True).strip()=='false';assert dead
  release.set();pending.result(timeout=25)
 source.write_text(original);start()
 assert call(secret)[0]==503,'Healthy lease must still serialize processing'
 waiting=time.monotonic()
 while sql(f"SELECT expires_at<=clock_timestamp() FROM private.lifecycle_delivery_invocations WHERE id='{invocation}'")!='t':
  assert time.monotonic()-waiting<40,'Database invocation expiry was not bounded'
  time.sleep(.25)
 assert sql(f"SELECT public.renew_lifecycle_delivery('{invocation}')")=='f','Expired lease must not resurrect'
 assert sql(f"SELECT public.finish_lifecycle_delivery('{invocation}')")=='f','Expired owner cannot finish drain'
 if PAUSE:
  assert call(secret)[0]==503,'Expired ownership does not bypass disabled control'
  assert sql(f"SELECT state='received' AND attempts=0 FROM private.lifecycle_work WHERE id='{probe}'")=='t'
  sql("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic resume after abandoned lease expiry')")
 status,body=call(secret)
 assert status==200 and body['result']=={'claimed':1,'advanced':1},'New worker must process exactly one item'
 assert sql(f"SELECT state='blocked' AND attempts=1 AND error_code='missing_identifier' FROM private.lifecycle_work WHERE id='{probe}'")=='t'
 header=json.dumps({'x-lifecycle-delivery':invocation})
 stale=subprocess.run(['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='{header}'; SELECT public.claim_lifecycle_work('stripe_cleanup',1); ROLLBACK;",text=True,capture_output=True)
 assert stale.returncode!=0 and 'authority expired' in stale.stderr,'Stale invocation must not claim another task'
 assert sql(f"SELECT finished_at IS NULL FROM private.lifecycle_delivery_invocations WHERE id='{invocation}'")=='t','Abandonment evidence must remain'
 result={'scenario':'A before claim','runtime':'actual local Edge','death_verified':dead,'restart_http_status':status,'provider_calls':0,'automatic_recovery':'PASS','real_expiry_wait_seconds':round(time.monotonic()-waiting,2),'stale_claim_denied':True,'manual_invocation_cleanup':False,'task_disposition':'blocked: missing synthetic identifier','quiesced_during_crash':PAUSE,'production_changes':0}
 print(json.dumps(result),flush=True)

finally:
 release.set();source.write_text(original)
 sql("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic worker crash test stopped')")
 server.shutdown();start()
 (OUT/('worker-crash-paused-result.json' if PAUSE else 'worker-crash-result.json')).write_text(json.dumps(result,indent=2)+'\n')
