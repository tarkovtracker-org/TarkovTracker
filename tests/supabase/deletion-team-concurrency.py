"""Synthetic users, real concurrent PostgreSQL sessions, fixed disposable loopback target."""
import importlib.util, json, pathlib, urllib.request, uuid
spec=importlib.util.spec_from_file_location('concurrency',pathlib.Path(__file__).with_name('provider-lifecycle-concurrency.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
config=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text())
if config['API_URL']!='http://127.0.0.1:59321':raise RuntimeError('Unexpected target')
def user():
 r=urllib.request.Request(config['API_URL']+'/auth/v1/admin/users',headers={'apikey':config['SERVICE_ROLE_KEY'],'Authorization':'Bearer '+config['SERVICE_ROLE_KEY'],'Content-Type':'application/json'},data=json.dumps({'email':str(uuid.uuid4())+'@example.invalid','password':'Synthetic-Test-Password-123!','email_confirm':True}).encode())
 with urllib.request.urlopen(r,timeout=10) as response:return json.load(response)['id']
def team(owner,mode):
 return json.loads(c.sql(f"SELECT row_to_json(t) FROM public.create_team_with_owner('synthetic-{uuid.uuid4().hex[:12]}','{uuid.uuid4().hex}',5,'{owner}','{mode}') t"))
def claim(uid):
 return json.loads(c.sql(f"SELECT row_to_json(j) FROM public.claim_account_deletion_job('{uid}',true) j"))['claim_token']
for mode in ['pvp','pve','seasonal']:
 owner=user();member=user();t=team(owner,mode)
 c.sql(f"SELECT public.join_team('{t['id']}','{t['join_code']}','{member}'); SELECT public.request_account_lifecycle('{owner}');")
 token=claim(owner)
 c.check(c.sql(f"SELECT public.seal_account_lifecycle('{owner}','{token}')")=='ready',mode+' owner seal succeeds')
 with c.Session() as leaving,c.Session() as preparing:
  leaving.run(f"SELECT public.leave_team('{t['id']}','{member}')")
  preparing.send(f"SELECT public.prepare_account_deletion('{owner}','{token}');")
  c.waiting(preparing)
  leaving.finish()
  c.check(preparing.run('SELECT 1').splitlines()[0]=='ready',mode+' preparation waits for real leave transaction')
  preparing.finish()
 c.check(c.sql(f"SELECT count(*) FROM public.teams WHERE id='{t['id']}'")=='0',mode+' owner-only team disbanded after committed member leave')
 c.check(c.sql(f"SELECT {mode}_team_id IS NULL FROM public.user_system WHERE user_id='{member}'")=='t',mode+' no stale member pointer')
 # A new request is usable until sealed, and explicit withdrawal can re-arm a parked job.
 uid=user();c.sql(f"SELECT public.request_account_lifecycle('{uid}');")
 old=claim(uid)
 c.sql(f"SELECT public.account_lifecycle_status('{uid}',true); SELECT public.park_account_lifecycle('{uid}','{old}','cancelled'); SELECT public.request_account_lifecycle('{uid}',true);")
 c.check(bool(claim(uid)),mode+' explicit restart reclaims withdrawn blocked job')
 # A user barrier must not serialize another unrelated user's sealing.
 other=user();c.sql(f"SELECT public.request_account_lifecycle('{other}');")
 other_token=claim(other)
 with c.Session() as held,c.Session() as unrelated:
  held.run(f"SELECT private.lifecycle_user_lock('{uid}')")
  unrelated.run("SET LOCAL statement_timeout='1s'")
  c.check(unrelated.run(f"SELECT public.seal_account_lifecycle('{other}','{other_token}')")=='ready',mode+' unrelated user seal does not wait for held user lock')
print(json.dumps({'total_assertions':len(c.results),'team_specific_assertions':len(c.results)-14}))
# The effect must wait at the user barrier before acquiring the work/revision locks.
u=user();c.sql(f"INSERT INTO public.supporters(user_id,type) VALUES('{u}','one_time')")
w=json.loads(c.sql(f"SELECT public.claim_stripe_lifecycle('evt_{uuid.uuid4().hex}','synthetic')"))
c.sql(f"SELECT public.bind_stripe_lifecycle('{w['id']}','{w['token']}','{u}')")
with c.Session() as barrier,c.Session() as effect,c.Session() as observer:
 barrier.run(f"SELECT private.lifecycle_user_lock('{u}')")
 headers=json.dumps({'x-lifecycle-work':w['id'],'x-lifecycle-claim':w['token']})
 effect.run(f"SET LOCAL request.headers='{headers}'")
 effect.send(f"UPDATE public.supporters SET status='active' WHERE user_id='{u}';")
 c.waiting(effect)
 c.check(observer.run(f"SELECT id FROM private.lifecycle_work WHERE id='{w['id']}' FOR UPDATE NOWAIT")==w['id'],'blocked supporter effect has not acquired work lock before user lock')
 observer.finish();barrier.finish()
 c.check(effect.run('SELECT 1')=='1','supporter effect resumes after barrier without deadlock')
 effect.finish()
c.check(c.sql(f"SELECT public.finish_lifecycle_work('{w['id']}','{w['token']}','completed')")=='t','effect completes under same fenced claim after contention')
print(json.dumps({'total_assertions':len(c.results),'team_and_lock_assertions':len(c.results)-14}))
