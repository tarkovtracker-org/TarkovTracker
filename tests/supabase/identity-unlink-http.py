"""Real supported GoTrue linking/unlinking; synthetic local Discord OAuth transport."""
import json,pathlib,subprocess,urllib.request,urllib.error,urllib.parse,uuid
cfg=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text());base=cfg['API_URL'];container='supabase_db_tt-b-http-disposable'
if base!='http://127.0.0.1:59321':raise RuntimeError('Unexpected target')
labels=json.loads(subprocess.check_output(['docker','inspect',container,'--format','{{json .Config.Labels}}']))
if labels.get('com.supabase.cli.project')!='tt-b-http-disposable':raise RuntimeError('Unexpected project')
auth=json.loads(subprocess.check_output(['docker','inspect','supabase_auth_tt-b-http-disposable']))[0]
env=dict(item.split('=',1) for item in auth['Config']['Env'])
if env.get('GOTRUE_EXTERNAL_DISCORD_URL')!='http://host.docker.internal:59400':raise RuntimeError('Discord is not isolated')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect)
def request(path,token=None,body=None,method=None):
 headers={'apikey':cfg['ANON_KEY'],'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 r=urllib.request.Request(base+path,headers=headers,data=None if body is None else json.dumps(body).encode(),method=method)
 try:
  with opener.open(r,timeout=15) as response:return response.status,json.loads(response.read() or b'null'),response.headers
 except urllib.error.HTTPError as e:
  body=e.read()
  return e.code,json.loads(body) if body.startswith(b'{') else None,e.headers
def sql(query):return subprocess.check_output(['docker','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=query,text=True).strip()
passed=[]
def check(value,label):
 if not value:raise AssertionError(label)
 passed.append(label);print('PASS',label,flush=True)
def create():
 email='synthetic-'+uuid.uuid4().hex+'@example.invalid';password='Synthetic-Auth-123!'
 status,user,_=request('/auth/v1/admin/users',cfg['SERVICE_ROLE_KEY'],{'email':email,'password':password,'email_confirm':True})
 check(status==200,'supported synthetic Auth user creation')
 status,session,_=request('/auth/v1/token?grant_type=password',body={'email':email,'password':password})
 check(status==200,'real Auth user credentials issued')
 return user['id'],email,session['access_token']
def link(uid,email,token):
 status,result,_=request('/auth/v1/user/identities/authorize?provider=discord&skip_http_redirect=true&redirect_to=http%3A%2F%2F127.0.0.1%3A3000',token)
 check(status==200,'supported identity authorize endpoint')
 url=result['url'];query=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
 check(urllib.parse.urlparse(url).netloc=='host.docker.internal:59400','OAuth provider is isolated mock')
 snowflake=str(uuid.uuid4().int % 10**18)
 callback='/auth/v1/callback?'+urllib.parse.urlencode({'code':snowflake+':'+email,'state':query['state'][0]})
 status,body,headers=request(callback)
 location=headers.get('Location','')
 check(status in [302,303] and 'error=' not in location,'real Auth callback accepts synthetic OAuth exchange')
 status,user,_=request('/auth/v1/user',token)
 identities=[i for i in user['identities'] if i['provider']=='discord']
 check(len(identities)==1,'real Auth stores linked Discord identity')
 return identities[0]['identity_id'],snowflake
uid,email,token=create();identity,snowflake=link(uid,email,token)
unlinked_user=uid
status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
check(status==200,'direct supported identity unlink succeeds')
check(sql(f"SELECT count(*) FROM auth.identities WHERE id='{identity}'")=='0','original identity linkage is absent')
count=sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{uid}' AND kind='discord_cleanup' AND resource_id='{snowflake}'")
check(int(count)>=1,'old provider identifier survives authoritative boundary obligations')
status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
check(status in [400,404,422],'repeated unlink is rejected without new mutation')
check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{uid}' AND kind='discord_cleanup' AND resource_id='{snowflake}'")==count,'repeated unlink does not duplicate work')
for credential in [cfg['ANON_KEY'],token]:
 status,_,_=request('/rest/v1/rpc/claim_lifecycle_work',credential,{'p_kind':'discord_cleanup','p_limit':1})
 check(status in [401,403,404],'ordinary client cannot claim private provider work')
print(json.dumps({'passed':len(passed),'auth_transport':'real','discord_oauth':'local mock','managed_auth_direct_mutations':False}))
# Hold the lifecycle barrier so both real HTTP operations contend before release.
import concurrent.futures,time
uid,email,token=create();identity,snowflake=link(uid,email,token)
cmd=['docker','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
held=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
held.stdin.write(f"BEGIN; SELECT private.lifecycle_user_lock('{uid}');\n\\echo HELD\n");held.stdin.flush()
import select,os
marker_deadline=time.monotonic()+8;marker_bytes=b''
try:
 while b'HELD\n' not in marker_bytes:
  remaining=marker_deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('Lifecycle barrier synchronization timed out')
  ready,_,_=select.select([held.stdout],[],[],remaining)
  if not ready:raise TimeoutError('Lifecycle barrier synchronization timed out')
  chunk=os.read(held.stdout.fileno(),4096)
  if not chunk:raise RuntimeError('Lifecycle barrier process exited before synchronization')
  marker_bytes+=chunk
except BaseException:
 held.stdin.close();held.terminate();held.wait(timeout=5)
 raise
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
 unlink=workers.submit(request,'/auth/v1/user/identities/'+identity,token,None,'DELETE')
 deletion=workers.submit(request,'/functions/v1/account-delete',token,{},'POST')
 try:
  deadline=time.monotonic()+5;observed=False
  while time.monotonic()<deadline:
   if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND state='active'"))>=1:observed=True;break
   time.sleep(.02)
 finally:
  held.stdin.write('COMMIT;\n');held.stdin.flush();held.stdin.close();held.wait(timeout=5)
 check(observed,'unlink/deletion encounter real database contention')
 unlink_status,_,_=unlink.result();delete_status,_,_=deletion.result()
 check(unlink_status==200 and delete_status==202,'concurrent supported unlink and candidate deletion return safe states')
check(sql(f"SELECT count(*)>0 FROM private.lifecycle_work WHERE user_id='{uid}' AND resource_id='{snowflake}' AND state<>'completed'")=='t','racing unlink and deletion preserve unfinished provider obligation')
status,_,_=request('/auth/v1/admin/users/'+uid,cfg['SERVICE_ROLE_KEY'])
check(status==200,'Auth remains while required Discord work is unfinished')
print(json.dumps({'passed':len(passed),'auth_transport':'real','discord_oauth':'local mock','managed_auth_direct_mutations':False}))

pathlib.Path('/tmp/tt-b-lifecycle-validation/identity-fixtures.json').write_text(json.dumps({'unlinked_user':unlinked_user,'racing_user':uid}))
# Earlier role DELETE is explicitly suspended at the provider transport boundary.
uid,email,token=create();identity,snowflake=link(uid,email,token)
old=str(uuid.uuid4());fence=str(uuid.uuid4())
sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,user_id,resource_id,action,state,claim_token,lease_until) VALUES('{old}','discord_cleanup','synthetic-inflight:{old}','{uid}','{snowflake}','remove_managed_roles','processing','{fence}',clock_timestamp()+interval '5 minutes')")
worker=subprocess.Popen(['deno','run','--config','supabase/functions/deno.json','tests/supabase/helpers/discord-inflight.deno.test.ts',snowflake],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 check(worker.stdout.readline().strip()=='IN_FLIGHT','earlier cleanup is suspended inside parsed HTTP transport')
 status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
 check(status==200,'supported unlink succeeds while earlier HTTP request remains in flight')
 newer=sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{uid}' AND id<>'{old}' AND resource_id='{snowflake}' AND state<>'completed'")
 check(int(newer)>0,'new unlink obligation preserves same identifier independently')
 worker.stdin.write('GO\n');worker.stdin.flush();worker.stdin.close()
 check(worker.stdout.readline().strip()=='IDEMPOTENT_ABSENCE','actual response parser accepts repeated absent-member removal')
 worker.wait(timeout=10);check(worker.returncode==0,'mock provider worker terminates successfully')
 check(sql(f"SELECT public.finish_lifecycle_work('{old}','{fence}','completed')")=='t','old worker completes only its fenced obligation')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{uid}' AND id<>'{old}' AND resource_id='{snowflake}' AND state<>'completed'")==newer,'old completion cannot complete newer unlink obligation')
 check(sql(f"SELECT resource_id FROM private.lifecycle_work WHERE id='{old}'")==snowflake,'completion retains old minimal identity evidence')
finally:
 if worker.poll() is None:worker.kill();worker.wait()
print(json.dumps({'passed':len(passed),'inflight_barrier':'explicit stdin/provider request','discord_provider':'mocked'}))
