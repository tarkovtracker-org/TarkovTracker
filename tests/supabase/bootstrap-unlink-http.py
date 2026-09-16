"""B0 capture through real local GoTrue; synthetic OAuth, no provider cleanup."""
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

assert sql("SELECT to_regclass('private.lifecycle_requests') IS NULL")=='t','Run on A+C plus B0 capture only'
uid,email,token=create();identity,snowflake=link(uid,email,token)
status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
check(status==200,'B0 direct Auth unlink succeeds without application wrapper')
check(sql(f"SELECT count(*) FROM auth.identities WHERE id='{identity}'")=='0','Auth linkage removed through supported API')
check(sql(f"SELECT count(*)>0 FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}' AND discord_id='{snowflake}'")=='t','B0 durable identifier survives removal of original linkage')
check(sql(f"SELECT count(*) FROM public.discord_account_links WHERE user_id='{uid}'")=='0','original application linkage cleared')
before=sql(f"SELECT count(*) FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}'")
status,_,_=request('/auth/v1/user/identities/'+identity,token,method='DELETE')
check(status in [400,404,422],'duplicate direct unlink safely rejected')
check(sql(f"SELECT count(*) FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}'")==before,'duplicate unlink does not create obligations')
check(sql("SELECT NOT has_table_privilege('anon','private.lifecycle_bootstrap_discord','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','private.lifecycle_bootstrap_discord','SELECT,INSERT,UPDATE,DELETE')")=='t','ordinary clients cannot read or mutate B0 identifiers')
check(sql(f"SELECT bool_and(handed_off_at IS NULL) FROM private.lifecycle_bootstrap_discord WHERE user_id='{uid}'")=='t','capture is pending evidence, never provider completion')
print(json.dumps({'passed':len(passed),'auth':'real supported local API','provider':'synthetic OAuth only','production_changes':0}))
