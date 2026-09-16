"""Actual old/new Nuxt route pairs against disposable Supabase and Stripe TEST.
No cutover evidence is inferred from route deployment or elapsed time.
"""
import json,os,pathlib,signal,subprocess,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path('/tmp/tt-b-delivery-final');C='supabase_db_tt-b-http-disposable'
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());assert cfg['API_URL']=='http://127.0.0.1:59321'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']));assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http' and labels['com.supabase.cli.project']=='tt-b-http-disposable'
env=dict(x.split('=',1) for x in (OUT/'edge.env').read_text().splitlines() if '=' in x and not x.startswith('#'));assert env['STRIPE_SECRET_KEY'].startswith('sk_test_')
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def stripe(method,path,data=None):
 args=['stripe',method,path,'--stripe-version','2024-06-20']
 if method!='get':args+=['--confirm']
 for k,v in (data or {}).items():args+=['-d',k+'='+str(v)]
 p=subprocess.run(args,capture_output=True,text=True,timeout=40);assert p.returncode==0,'TEST Stripe request failed (response withheld)'
 obj=json.loads(p.stdout);assert 'error' not in obj
 if 'livemode' in obj:assert obj['livemode'] is False
 return obj
assert stripe('get','/v1/balance')['livemode'] is False
req=urllib.request.Request('https://api.stripe.com/v1/account',headers={'Authorization':'Bearer '+env['STRIPE_SECRET_KEY']})
with urllib.request.urlopen(req,timeout=15) as r:assert json.load(r)['id']==stripe('get','/v1/account')['id']
def request(url,token=None,data=None,service=False):
 headers={'Content-Type':'application/json','apikey':cfg['SERVICE_ROLE_KEY'] if service else cfg['ANON_KEY']}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None),timeout=55) as r:return r.status,json.loads(r.read() or b'null')
 except urllib.error.HTTPError as r:return r.code,json.loads(r.read() or b'null')
def rpc(name,data):return request(cfg['API_URL']+'/rest/v1/rpc/'+name,cfg['SERVICE_ROLE_KEY'],data,True)
def user():
 email='portal-'+uuid.uuid4().hex+'@example.invalid';pw='Synthetic-Portal-123!'
 code,u=request(cfg['API_URL']+'/auth/v1/admin/users',cfg['SERVICE_ROLE_KEY'],{'email':email,'password':pw,'email_confirm':True},True);assert code==200
 code,t=request(cfg['API_URL']+'/auth/v1/token?grant_type=password',data={'email':email,'password':pw});assert code==200
 return u['id'],t['access_token']
checks=[]
def check(ok,label):assert ok,label;checks.append(label);print('PASS '+label,flush=True)
def worker(task):
 sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 deadline=time.monotonic()+45
 while True:
  code,result=request(cfg['API_URL']+'/functions/v1/lifecycle-worker?kind=stripe_cleanup',env['LIFECYCLE_WORKER_SECRET'],b'')
  if code==200:return result
  assert code==503 and time.monotonic()<deadline,'actual worker request failed: '+str(code)
  time.sleep(.3)
assert sql('SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()')=='0'
localenv={k:os.environ[k] for k in ['PATH','HOME','LANG','XDG_CACHE_HOME'] if k in os.environ}
localenv.update({'NODE_ENV':'development','SUPABASE_URL':cfg['API_URL'],'SUPABASE_ANON_KEY':cfg['ANON_KEY'],'NUXT_SUPABASE_SERVICE_KEY':cfg['SERVICE_ROLE_KEY'],'STRIPE_SECRET_KEY':env['STRIPE_SECRET_KEY'],'APP_URL':'http://127.0.0.1:59510','NUXT_TELEMETRY_DISABLED':'1','NITRO_PRESET':'node-server'})

import shutil,hashlib,sys
APP=pathlib.Path('/tmp/tt-b-partial-app');assert APP.is_dir() and (APP/'.git').is_file()
BASE='08e34653dc9867dcf716c4845cde0cffcf8b88a6'
assert sql('SELECT count(*) FROM private.billing_application_cutovers')=='0','Start from fresh final schema without synthetic cutover'
process=None;sources=[]
try:
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic partial app matrix'); SELECT public.set_lifecycle_delivery('deletion_reconcile',true,'synthetic partial app matrix')")
 variants=({'checkout','portal'},) if '--only-both-new' in sys.argv else ({'checkout'},{'portal'},{'checkout','portal'})
 for new_routes in variants:
  for name in ('checkout','portal'):
   path='app/server/api/stripe/'+name+'.post.ts'
   data=(ROOT/path).read_bytes() if name in new_routes else subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
   (APP/path).write_bytes(data)
   sources.append({'variant':sorted(new_routes),'route':name,'sha256':hashlib.sha256(data).hexdigest()})
  log=(OUT/'partial-app-nuxt-RESTRICTED.log').open('a');os.chmod(log.name,0o600)
  process=subprocess.Popen([str(ROOT/'node_modules/.bin/nuxt'),'dev','--host','127.0.0.1','--port','59510','--dotenv',str(OUT/'nuxt-empty.env'),'--no-fork'],cwd=APP,env=localenv,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  for _ in range(180):
   assert process.poll() is None,'variant Nuxt exited'
   try:
    if request('http://127.0.0.1:59510/api/stripe/checkout',data={})[0]==401:break
   except OSError:pass
   time.sleep(.5)
  else:raise AssertionError('variant route unavailable')
  u,token=user();customer=stripe('post','/v1/customers',{'metadata[user_id]':u})['id']
  sql(f"INSERT INTO public.supporters(user_id,type,stripe_customer_id) VALUES('{u}','one_time','{customer}')")
  code,checkout=request('http://127.0.0.1:59510/api/stripe/checkout',token,{'mode':'payment','amount':5})
  check(code==200 and checkout.get('url','').startswith('https://checkout.stripe.com/'),'actual '+str(sorted(new_routes))+' Checkout creates TEST session')
  code,portal=request('http://127.0.0.1:59510/api/stripe/portal',token,{})
  check(code==200 and portal.get('url','').startswith('https://billing.stripe.com/'),'actual Portal creates TEST session')
  del checkout,portal
  expected=','.join(sorted(new_routes))
  check(sql(f"SELECT string_agg(operation,',' ORDER BY operation) FROM private.provider_initiations WHERE user_id='{u}'")==expected,'each reservation-aware route records its initiation')
  code,r=rpc('request_account_lifecycle',{'p_user_id':u});check(code==200,'deletion request captured under mixed app')
  j=json.loads(sql(f"SELECT row_to_json(j) FROM public.claim_account_deletion_job('{u}',TRUE) j"));assert j['claimed']
  claim=j['claim_token'];args={'p_user_id':u,'p_claim_token':claim}
  code,proof=200,json.loads(sql(f"SELECT public.begin_final_billing_verification('{u}','{claim}')"))
  check(code==200 and proof['status']=='provider_wait','missing authoritative app cutover denies fresh verification')
  code,allowed=200,sql(f"SELECT public.authorize_account_auth_delete('{u}','{claim}')")=='t';check(code==200 and allowed is False,'mixed application cannot authorize irreversible Auth deletion')
  check(request(cfg['API_URL']+'/auth/v1/user',token)[0]==200,'synthetic Auth remains usable under partial deployment')
  os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=20);process=None
 sql("SELECT public.confirm_billing_application_cutover(repeat('a',64),repeat('b',64),'synthetic both route versions verified')")
 code,proof=200,json.loads(sql(f"SELECT public.begin_final_billing_verification('{u}','{claim}')"))
 check(code==200 and proof['status']=='provider_wait','both routes plus incomplete 24-hour horizon remain blocked')
 (OUT/'resume-partial-app-sources.json').write_text(json.dumps(sources,indent=2)+'\n')
 print(json.dumps({'passed':len(checks),'failed':0,'actual_route_variants':len(variants),'actual':'Nuxt routes, local Auth and Stripe TEST sessions','production_changes':0}),flush=True)
finally:
 if process is not None:os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=20)
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',false,'partial app test stopped'); SELECT public.set_lifecycle_delivery('deletion_reconcile',false,'partial app test stopped')")
