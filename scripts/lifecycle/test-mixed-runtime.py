"""Disposable A+C/B0/final runtime sequencing; no hosted deployments or providers invoked.
Missing/invalid-signature HTTP checks supplement (not replace) prior genuine signed evidence.
Local process termination proves local retirement only, not hosted routing/drain.
"""
import sys,hashlib,json,os,pathlib,shutil,signal,subprocess,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2];STAGE=pathlib.Path('/tmp/tt-b-http');OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable';EDGE='supabase_edge_runtime_tt-b-http-disposable';BASE='08e34653dc9867dcf716c4845cde0cffcf8b88a6'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']==str(STAGE)
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321' and cfg['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_') and env['DISCORD_BOT_TOKEN']=='synthetic-discord-no-external-access'
assert not (STAGE/'supabase/functions/.env').exists()
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
assert sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t'
checks=[];stages=[]
def check(ok,label):
 assert ok,label
 checks.append(label);print('PASS '+label,flush=True)
def stop():
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().decode().split('\0')
   if 'functions' in args and 'serve' in args and str(STAGE) in args:os.kill(int(p.name),signal.SIGINT)
  except (OSError,UnicodeError):pass
 subprocess.run(['docker','stop',EDGE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def http(name,key=None):
 headers={'apikey':cfg['ANON_KEY'],'Content-Type':'application/json'}
 if key:headers['Authorization']='Bearer '+key
 try:
  with urllib.request.urlopen(urllib.request.Request(cfg['API_URL']+'/functions/v1/'+name,headers=headers,data=b'{}'),timeout=10) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read() or b'null')
 except OSError:return 0,{}
def restart():
 stop();log=(OUT/'mixed-edge-RESTRICTED.log').open('a');os.chmod(log.name,0o600)
 subprocess.Popen([str(ROOT/'node_modules/.bin/supabase'),'functions','serve','--workdir',str(STAGE),'--import-map',str(STAGE/'supabase/functions/deno.json'),'--env-file',str(OUT/'edge.env')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 for _ in range(60):
  if http('stripe-webhook')[0]==401:return
  time.sleep(.25)
 raise AssertionError('Local Edge did not start')
def copy(path,data):
 p=STAGE/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
def original(path):return subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
def run(args,name,timeout=120):
 with (OUT/name).open('w') as log:r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,timeout=timeout)
 assert r.returncode==0,name+' failed; inspect local evidence'
def bridges():
 for name in ['account-delete','account-delete-reconcile']:
  code,body=http(name);check(code==503 and body.get('completed') is False,name+' bridge does not acknowledge/execute work')
 check(http('stripe-webhook')[0]==401,'bridge rejects unsigned ingress')
def version(name):return hashlib.sha256((STAGE/'supabase/functions'/name/'index.ts').read_bytes()).hexdigest()
bridge_sources={name:("import { deletionMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(deletionMaintenance);\n").encode() for name in ['account-delete','account-delete-reconcile']}
bridge_sources['stripe-webhook']=b"import { stripeMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(stripeMaintenance(Deno.env.get('STRIPE_WEBHOOK_SECRET')));\n"
phase=OUT/('mixed-phase-'+uuid.uuid4().hex);(phase/'supabase/migrations').mkdir(parents=True)
shutil.copy2(STAGE/'supabase/config.toml',phase/'supabase/config.toml')
steps=['20260914092616_lifecycle_unlink_bootstrap.sql','20260912190000_billing_initiation_bootstrap.sql','20260912201429_provider_lifecycle_foundation.sql','20260914074055_lifecycle_delivery_controls.sql','20260914074830_lifecycle_delivery_eligibility.sql','20260914092617_lifecycle_bootstrap_handoff.sql','20260915032640_lifecycle_delivery_leases.sql','20260915032641_lifecycle_canonical_capture.sql','20260916025544_final_billing_truth.sql']
try:
 if '--resume-final' not in sys.argv:
  stop()
  run([str(ROOT/'node_modules/.bin/supabase'),'db','reset','--local','--no-seed','--version','20260912085904','--workdir',str(STAGE)],'mixed-ac-reset.log',180)
  check(sql('SELECT max(version) FROM supabase_migrations.schema_migrations')=='20260912085904','exact A+C migration boundary')
  paths=subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'supabase/functions'],cwd=ROOT,text=True).splitlines()
  for path in paths:copy(path,original(path))
  for name in ['lifecycle-maintenance.ts','stripe-signature.ts']:copy('supabase/functions/_shared/'+name,(ROOT/'supabase/functions/_shared'/name).read_bytes())
  # Worker cannot remain deployed from the prior final-schema test target.
  worker=STAGE/'supabase/functions/lifecycle-worker/index.ts';worker.write_text("Deno.serve(()=>new Response(null,{status:503}));\n")
  restart()
  check(http('account-delete')[0]==401 and http('account-delete-reconcile')[0]==401,'old A+C endpoints authenticate at baseline')
  stages.append({'stage':'A+C','old_runtime':True})
  for name in ['stripe-webhook','account-delete','account-delete-reconcile']:
   copy('supabase/functions/'+name+'/index.ts',bridge_sources[name]);restart()
   check(version(name)==hashlib.sha256(bridge_sources[name]).hexdigest(),name+' bridge source installed independently')
   if name!='stripe-webhook':check(http(name)[0]==503,name+' maintenance active')
   stages.append({'stage':'partial B0 '+name,'schema':'A+C','migration_allowed':name=='account-delete-reconcile'})
  bridges()
  # Local retirement is direct process termination, stronger than merely changing source files.
  stop();r=subprocess.run(['docker','inspect',EDGE,'--format','{{.State.Running}}'],capture_output=True,text=True)
  check(r.returncode!=0 or r.stdout.strip()=='false','local legacy Edge process retired before schema changes')
  restart()
  for f in (ROOT/'supabase/migrations').glob('*.sql'):
   if f.name.split('_')[0]<='20260912085904':shutil.copy2(f,phase/'supabase/migrations'/f.name)
  for filename in steps:
   shutil.copy2(ROOT/'supabase/migrations'/filename,phase/'supabase/migrations'/filename)
   run([str(ROOT/'node_modules/.bin/supabase'),'db','push','--local','--include-all','--skip-vault','--yes','--workdir',str(phase)],'mixed-'+filename+'.log',60)
   check(sql(f"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='{filename.split('_')[0]}'")=='1',filename+' applied once')
   bridges();stages.append({'stage':filename,'runtime':'three bridges; worker suspended'})
   if filename==steps[0]:run(['python3',str(ROOT/'tests/supabase/bootstrap-unlink-http.py')],'mixed-bootstrap-auth.log',90)
  check(sql('SELECT bool_and(NOT enabled) FROM private.lifecycle_delivery_controls')=='t','final controls closed')
  # Handoff is durable local evidence transfer, never external cleanup.
  sql('SELECT public.handoff_bootstrap_discord(100)')
  # Shared code is packaged independently with each hosted function; here all old mutable entrypoints are already bridges.
  for f in (ROOT/'supabase/functions/_shared').glob('*'):
   if f.is_file():copy('supabase/functions/_shared/'+f.name,f.read_bytes())
  copy('supabase/functions/deno.json',(ROOT/'supabase/functions/deno.json').read_bytes())
  for name in ['stripe-webhook','account-delete','account-delete-reconcile','lifecycle-worker']:
   copy('supabase/functions/'+name+'/index.ts',(ROOT/'supabase/functions'/name/'index.ts').read_bytes());restart()
   check(version(name)==hashlib.sha256((ROOT/'supabase/functions'/name/'index.ts').read_bytes()).hexdigest(),name+' final source installed individually')
   check(http('stripe-webhook')[0]==401,'final/bridge webhook keeps signature boundary')
   if name!='lifecycle-worker':check(http('lifecycle-worker',env['LIFECYCLE_WORKER_SECRET'])[0]==503,'worker remains suspended during partial final deployment')
   stages.append({'stage':'partial final '+name,'controls':'closed','schedule':'OFF'})
  check(http('lifecycle-worker?kind=stripe_cleanup',env['LIFECYCLE_WORKER_SECRET'])[0]==400,'worker rejects body before admission')
  for name in ['account-delete','account-delete-reconcile']:check(http(name)[0]==401,name+' final authentication intact')
 # Explicit staged resume; invoking the normal concurrent-deletion suite while closed correctly returns 503.
 for component in ['provider_processing','deletion_reconcile','deletion_intake']:
  sql(f"SELECT public.set_lifecycle_delivery('{component}',true,'synthetic staged resume')")
 # Real isolated Auth unlink against final capture; external Discord remains mocked.
 run(['python3',str(ROOT/'tests/supabase/identity-unlink-http.py')],'mixed-final-auth.log',150)
 for component in ['deletion_intake','deletion_reconcile','provider_processing']:
  sql(f"SELECT public.set_lifecycle_delivery('{component}',false,'synthetic rehearsal complete')")
 check(sql("SELECT count(*) FROM cron.job WHERE jobname ~* 'lifecycle|provider|account.?delet' AND jobname<>'account-deletion-attempts-cleanup'")=='0','no worker schedule')
 check(sql("SELECT NOT enabled FROM private.lifecycle_delivery_controls WHERE component='provider_processing'")=='t','provider processing remains closed')
 print(json.dumps({'passed':len(checks),'stages':stages,'local_process_retirement':True,'hosted_drain_proven':False,'not_covered':'in-flight legacy external side effects; signed receipt at every intermediate stage; hosted partial deployment','production_changes':0}),flush=True)
finally:
 # Never restore unsafe legacy entrypoints after schema transition, even if this rehearsal fails.
 for name,data in bridge_sources.items():
  if sql("SELECT to_regprocedure('public.renew_lifecycle_delivery(uuid)') IS NOT NULL")!='t':copy('supabase/functions/'+name+'/index.ts',data)
 restart()
