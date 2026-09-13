import json,urllib.request,urllib.error,subprocess,uuid,sys,time,datetime,pathlib
ROOT=pathlib.Path('/tmp/tt-b-http'); CONFIG=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text()); BASE=CONFIG['API_URL']; CONTAINER='supabase_db_tt-b-http-disposable'
assert BASE=='http://127.0.0.1:59321' and CONFIG['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
labels=json.loads(subprocess.check_output(['docker','inspect',CONTAINER,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.workdir']==str(ROOT) and labels['com.supabase.cli.project']=='tt-b-http-disposable'
assert not (ROOT/'supabase/functions/.env').exists()
def sql(q):
 return subprocess.check_output(['docker','exec','-i',CONTAINER,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input=q.encode()).decode().strip()
def req(path,token=None,data=None,method=None):
 h={'apikey':CONFIG['ANON_KEY'],'Content-Type':'application/json'}
 if token:h['Authorization']='Bearer '+token
 if token==CONFIG['SERVICE_ROLE_KEY']:h['apikey']=token
 r=urllib.request.Request(BASE+path,headers=h,data=json.dumps(data).encode() if data is not None else None,method=method)
 try:
  with urllib.request.urlopen(r,timeout=30) as v:return v.status,json.loads(v.read() or b'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'null')
def ok(condition,label):
 assert condition,label
 print('PASS '+label,flush=True)
def user(label):
 email=f'a-{label}-{uuid.uuid4()}@example.invalid'; password='Isolated-test-pass-123!'
 code,u=req('/auth/v1/admin/users',CONFIG['SERVICE_ROLE_KEY'],{'email':email,'password':password,'email_confirm':True})
 assert code==200,(code,u)
 code,t=req('/auth/v1/token?grant_type=password',None,{'email':email,'password':password})
 assert code==200,(code,t)
 return {'id':u['id'],'token':t['access_token']}
def team(owner,mode):
 code,t=req('/rest/v1/rpc/create_team_with_owner',CONFIG['SERVICE_ROLE_KEY'],{'p_name':'isolated-'+uuid.uuid4().hex[:12],'p_join_code':uuid.uuid4().hex[:12],'p_max_members':5,'p_owner_id':owner['id'],'p_game_mode':mode})
 assert code==200,(code,t)
 return t

def join(t,u):
 code,r=req('/rest/v1/rpc/join_team',CONFIG['SERVICE_ROLE_KEY'],{'p_team_id':t['id'],'p_join_code':t['join_code'],'p_user_id':u['id']}); assert code==204,(code,r)
def event(t,u):return {'team_id':t['id'],'event_type':'member_left','initiated_by':u['id'],'target_user':u['id'],'created_at':'2099-01-01T00:00:00Z'}
def edge(name,u,body):return req('/functions/v1/'+name,u['token'],body)


for mode in ['pvp','pve','seasonal']:
 owner=user('b-owner');member=user('b-member');t=team(owner,mode);join(t,member)
 code,r=edge('account-delete',owner,{})
 ok(code==200 and r.get('success') is True,mode+' real Edge/Auth owner deletion completes')
 code,r=req('/auth/v1/admin/users/'+owner['id'],CONFIG['SERVICE_ROLE_KEY'])
 ok(code==404,mode+' supported Auth deletion confirmed absent')
 ok(sql(f"SELECT owner_id FROM public.teams WHERE id='{t['id']}'")==member['id'],mode+' remaining team transferred, not destroyed')
 ok(sql(f"SELECT {mode}_team_id FROM public.user_system WHERE user_id='{member['id']}'")==t['id'],mode+' successor pointer retained')
 solo=user('b-solo');t2=team(solo,mode)
 code,r=edge('account-delete',solo,{})
 ok(code==200 and r.get('success') is True,mode+' owner-only real Auth deletion completes')
 ok(sql(f"SELECT count(*) FROM public.teams WHERE id='{t2['id']}'")=='0',mode+' owner-only disband contract')
plain=user('b-plain');code,r=edge('account-delete',plain,{})
ok(code==200 and r.get('success') is True,'provider-free no-team deletion')
for shape in ['stripe_customer','stripe_subscription','discord_supporter','discord_link']:
 u=user(shape)
 if shape=='discord_link':
  sql(f"INSERT INTO public.discord_account_links(user_id,discord_user_id,discord_username) VALUES('{u['id']}','{uuid.uuid4().int % 10**18}','synthetic')")
 else:
  column={'stripe_customer':'stripe_customer_id','stripe_subscription':'stripe_subscription_id','discord_supporter':'discord_user_id'}[shape]
  value={'stripe_customer':'cus_synthetic','stripe_subscription':'sub_synthetic','discord_supporter':'123456789012345678'}[shape]
  sql(f"INSERT INTO public.supporters(user_id,type,{column}) VALUES('{u['id']}','one_time','{value}')")
 code,r=edge('account-delete',u,{})
 if shape.startswith('stripe'):
  ok(code==202 and r.get('status')=='provider_wait',shape+' remains pending, not falsely deleted')
  ok(sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u['id']}'")=='provider_wait',shape+' reversible request state')
  t=team(u,'pvp');ok(bool(t['id']),shape+' pending user can still create/own a team')
  code,status=req('/rest/v1/rpc/account_lifecycle_status',CONFIG['SERVICE_ROLE_KEY'],{'p_user_id':u['id'],'p_cancel':True})
  ok(code==200 and status['state']=='cancelled',shape+' withdrawal before seal succeeds')
 else:
  ok(code==202 and r.get('status')=='provider_pending',shape+' sealed deletion waits for Discord completion')
  ok(sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u['id']}'")=='prepared',shape+' irreversible preparation explicit')
  code,status=req('/rest/v1/rpc/account_lifecycle_status',CONFIG['SERVICE_ROLE_KEY'],{'p_user_id':u['id'],'p_cancel':True})
  ok(code==200 and status['state']=='prepared' and status['can_cancel'] is False,shape+' cannot withdraw after preparation')
  ok(sql(f"SELECT count(*) FROM auth.users WHERE id='{u['id']}'")=='1',shape+' Auth retained until provider completion')
# A Stripe supporter mutation must durably enqueue its Discord effect in the same transaction.
u=user('atomic-outbox')
sql(f"INSERT INTO public.supporters(user_id,type,discord_user_id) VALUES('{u['id']}','one_time','987654321012345678')")
code,claim=req('/rest/v1/rpc/claim_stripe_lifecycle',CONFIG['SERVICE_ROLE_KEY'],{'p_event_id':'evt_'+uuid.uuid4().hex,'p_type':'checkout.session.async_payment_failed'})
ok(code==200 and claim['state']=='processing','Stripe inbox obtains real service claim')
code,bound=req('/rest/v1/rpc/bind_stripe_lifecycle',CONFIG['SERVICE_ROLE_KEY'],{'p_id':claim['id'],'p_token':claim['token'],'p_user_id':u['id']})
ok(code==200 and bound is True,'Stripe claim bound before provider/effect phase')
headers=json.dumps({'x-lifecycle-work':claim['id'],'x-lifecycle-claim':claim['token']})
sql(f"BEGIN; SELECT set_config('request.headers','{headers}',true); UPDATE public.supporters SET status='expired' WHERE user_id='{u['id']}'; COMMIT;")
ok(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE parent_id='{claim['id']}'")=='1','entitlement commit atomically preserves Discord obligation')
code,finished=req('/rest/v1/rpc/finish_lifecycle_work',CONFIG['SERVICE_ROLE_KEY'],{'p_id':claim['id'],'p_token':claim['token'],'p_state':'completed'})
ok(code==200 and finished is True,'Stripe application stage can finish without declaring external completion')
ok(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{claim['id']}'")=='waiting','Stripe event remains unfinished until Discord task completes')
# A legacy receipt is not promoted to completed merely because it exists.
legacy='evt_legacy_'+uuid.uuid4().hex
sql(f"INSERT INTO public.stripe_events(event_id,event_type,received_at) VALUES('{legacy}','synthetic',now()-interval '100 days')")
code,legacy_state=req('/rest/v1/rpc/claim_stripe_lifecycle',CONFIG['SERVICE_ROLE_KEY'],{'p_event_id':legacy,'p_type':'synthetic'})
ok(code==200 and legacy_state['state']=='operator_review','legacy receipt remains unknown historical')
sql(f"DELETE FROM public.stripe_events WHERE event_id='{legacy}'")
ok(sql(f"SELECT count(*) FROM public.stripe_events WHERE event_id='{legacy}'")=='1','age-only retention cannot purge unknown historical receipt')
# Complete synthetic Discord provider work through the real RPC transport, then retry actual Auth.
# Provider response is mocked as a confirmed 204; no Discord network request is made.
u=user('provider-completion')
sql(f"INSERT INTO public.supporters(user_id,type,discord_user_id) VALUES('{u['id']}','one_time','{uuid.uuid4().int % 10**18}')")
code,pending=edge('account-delete',u,{})
ok(code==202 and pending['status']=='provider_pending','provider-backed Auth deletion waits at prepared boundary')
code,tasks=req('/rest/v1/rpc/claim_lifecycle_work',CONFIG['SERVICE_ROLE_KEY'],{'p_kind':'discord_cleanup','p_limit':25})
ok(code==200 and isinstance(tasks,list),'real PostgREST returns restricted provider claims to service role')
owned=[task for task in tasks if task['user_id']==u['id']]
ok(len(owned)==1,'synthetic deletion has one deduplicated provider obligation')
for task in owned:
 code,result=req('/rest/v1/rpc/finish_lifecycle_work',CONFIG['SERVICE_ROLE_KEY'],{'p_id':task['id'],'p_token':task['claim_token'],'p_state':'completed'})
 ok(code==200 and result is True,'mocked confirmed provider removal completes fenced task')
sql(f"UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='{u['id']}'")
code,completed=edge('account-delete',u,{})
ok(code==200 and completed.get('success') is True,'retry after provider completion deletes Auth through actual Edge path')
ok(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE user_id='{u['id']}' AND state<>'completed'")=='0','expected Auth cascade does not manufacture a new blocked obligation')
ok(sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u['id']}'")=='completed','provider-backed workflow records completion after Auth absence')
