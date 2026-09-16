"""Additional real-session interleavings on top of the existing synthetic concurrency harness."""
import importlib.util,pathlib,subprocess,time,uuid,json
spec=importlib.util.spec_from_file_location('team',pathlib.Path(__file__).with_name('deletion-team-concurrency.py'));t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c=t.c
for mode in ['pvp','pve','seasonal']:
 owner=t.user();member=t.user();team=t.team(owner,mode)
 c.sql(f"SELECT public.request_account_lifecycle('{member}')");token=t.claim(member)
 with c.Session() as joining,c.Session() as sealing:
  joining.run(f"SELECT public.join_team('{team['id']}','{team['join_code']}','{member}')")
  sealing.send(f"SELECT public.seal_account_lifecycle('{member}','{token}');")
  start=time.monotonic();c.waiting(sealing,joining);joining.finish()
  c.check(sealing.run('SELECT 1').splitlines()[0]=='ready',mode+' seal waits for committed join',wait_seconds=round(time.monotonic()-start,3));sealing.finish()
 c.check(c.sql(f"SELECT {mode}_team_id FROM public.user_system WHERE user_id='{member}'")==team['id'],mode+' join pointer preserved across seal')
 result=subprocess.run(c.CMD,input=f"SELECT public.transfer_team_ownership('{team['id']}','{owner}','{member}');",text=True,capture_output=True)
 c.check(result.returncode!=0 and '55000' in result.stderr,mode+' sealed member cannot be promoted')
 c.check(c.sql(f"SELECT owner_id FROM public.teams WHERE id='{team['id']}'")==owner,mode+' rejected transfer preserves original ownership')
 # Transfer commits before preparation; preparation must not destroy the new owner's team.
 a=t.user();b=t.user();team=t.team(a,mode);c.sql(f"SELECT public.join_team('{team['id']}','{team['join_code']}','{b}'); SELECT public.request_account_lifecycle('{a}');")
 token=t.claim(a);c.sql(f"SELECT public.seal_account_lifecycle('{a}','{token}')")
 with c.Session() as transfer,c.Session() as prepare:
  transfer.run(f"SELECT public.transfer_team_ownership('{team['id']}','{a}','{b}')")
  prepare.send(f"SELECT public.prepare_account_deletion('{a}','{token}');")
  c.waiting(prepare,transfer);transfer.finish()
  c.check(prepare.run('SELECT 1').splitlines()[0]=='ready',mode+' preparation rechecks concurrent transfer');prepare.finish()
 c.check(c.sql(f"SELECT owner_id FROM public.teams WHERE id='{team['id']}'")==b,mode+' transferred team survives deletion preparation')
 # Owner disband and preparation serialize on the same actual team row.
 a=t.user();team=t.team(a,mode);c.sql(f"SELECT public.request_account_lifecycle('{a}')");token=t.claim(a);c.sql(f"SELECT public.seal_account_lifecycle('{a}','{token}')")
 with c.Session() as disband,c.Session() as prepare:
  disband.run(f"SELECT public.disband_team('{team['id']}','{a}')")
  prepare.send(f"SELECT public.prepare_account_deletion('{a}','{token}');")
  c.waiting(prepare,disband);disband.finish()
  c.check(prepare.run('SELECT 1').splitlines()[0]=='ready',mode+' concurrent disband prepares idempotently');prepare.finish()
 c.check(c.sql(f"SELECT count(*) FROM public.teams WHERE id='{team['id']}'")=='0',mode+' disband leaves no team split state')
# Reservation commits before sealing: unresolved provider action must block irreversible preparation.
u=t.user();c.sql(f"SELECT public.request_account_lifecycle('{u}')");token=t.claim(u,verify=False)
with c.Session() as reserve,c.Session() as seal:
 reserve.run(f"SELECT public.reserve_provider_initiation('{u}','checkout','synthetic-fingerprint')")
 seal.send(f"SELECT public.seal_account_lifecycle('{u}','{token}');");c.waiting(seal,reserve);reserve.finish()
 c.check(seal.run('SELECT 1').splitlines()[0]=='provider_wait','external initiation reservation blocks racing seal');seal.finish()
# Clearing a linkage cannot discard its obligation while deletion waits.
customer='cus_'+uuid.uuid4().hex
c.sql(f"INSERT INTO public.supporters(user_id,type,stripe_customer_id) VALUES('{u}','one_time','{customer}')")
with c.Session() as clearing,c.Session() as snapshot:
 clearing.run(f"UPDATE public.supporters SET stripe_customer_id=NULL WHERE user_id='{u}'")
 snapshot.send(f"SELECT public.request_account_lifecycle('{u}');");c.waiting(snapshot,clearing);clearing.finish()
 snapshot.run('SELECT 1');snapshot.finish()
c.check(c.sql(f"SELECT count(*)>0 FROM private.lifecycle_work WHERE user_id='{u}' AND resource_id='{customer}' AND state<>'completed'")=='t','clearing preserves unresolved provider obligation before snapshot')
# A bounded team-lock timeout rolls back preparation, and exact retry completes once.
u=t.user();team=t.team(u,'pvp');c.sql(f"SELECT public.request_account_lifecycle('{u}')");token=t.claim(u);c.sql(f"SELECT public.seal_account_lifecycle('{u}','{token}')")
with c.Session() as held:
 held.run(f"SELECT id FROM public.teams WHERE id='{team['id']}' FOR UPDATE")
 start=time.monotonic();result=subprocess.run(c.CMD,input=f"SELECT public.prepare_account_deletion('{u}','{token}');",text=True,capture_output=True)
 elapsed=time.monotonic()-start
 c.check(result.returncode!=0 and '55P03' in result.stderr and elapsed<8,'preparation lock timeout is bounded',seconds=round(elapsed,3))
 c.check(c.sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u}'")=='sealed','timed-out preparation leaves reversible transaction state intact')
c.check(c.sql(f"SELECT public.prepare_account_deletion('{u}','{token}')")=='ready','retry after lock release prepares once')
c.check(c.sql(f"SELECT public.prepare_account_deletion('{u}','{token}')")=='ready','repeat preparation remains idempotent')
print(json.dumps({'passed':len(c.results)}))
# A provider read bound to an old revision cannot overwrite a newer application effect.
u=t.user();c.sql(f"INSERT INTO public.supporters(user_id,type) VALUES('{u}','one_time')")
w=json.loads(c.sql(f"SELECT public.claim_stripe_lifecycle('evt_{uuid.uuid4().hex}','synthetic')"));c.sql(f"SELECT public.bind_stripe_lifecycle('{w['id']}','{w['token']}','{u}')")
c.sql(f"UPDATE public.supporters SET tier='scav' WHERE user_id='{u}'")
headers=json.dumps({'x-lifecycle-work':w['id'],'x-lifecycle-claim':w['token']})
result=subprocess.run(c.CMD,input=f"BEGIN; SET LOCAL request.headers='{headers}'; UPDATE public.supporters SET tier='timmy' WHERE user_id='{u}'; COMMIT;",text=True,capture_output=True)
c.check(result.returncode!=0 and '40001' in result.stderr,'provider state revision changing between lookup and commit rejects stale effect')
c.check(c.sql(f"SELECT tier FROM public.supporters WHERE user_id='{u}'")=='scav','stale effect rolls back without entitlement restoration')
c.sql(f"SELECT public.finish_lifecycle_work('{w['id']}','{w['token']}','retryable'); UPDATE private.lifecycle_work SET available_at=clock_timestamp() WHERE id='{w['id']}';")
event_id=c.sql(f"SELECT resource_id FROM private.lifecycle_work WHERE id='{w['id']}'")
retry=json.loads(c.sql(f"SELECT public.claim_stripe_lifecycle('{event_id}','synthetic')"));c.sql(f"SELECT public.bind_stripe_lifecycle('{retry['id']}','{retry['token']}','{u}')")
headers=json.dumps({'x-lifecycle-work':retry['id'],'x-lifecycle-claim':retry['token']})
c.sql(f"BEGIN; SET LOCAL request.headers='{headers}'; UPDATE public.supporters SET tier='scav' WHERE user_id='{u}'; COMMIT;")
c.check(c.sql(f"SELECT public.finish_lifecycle_work('{retry['id']}','{retry['token']}','completed')")=='t','fresh fenced retry commits the current provider decision once')
print(json.dumps({'passed':len(c.results)}))
u=t.user();c.sql(f"SELECT public.request_account_lifecycle('{u}')")
with c.Session() as first,c.Session() as second:
 initial=json.loads(first.run(f"SELECT row_to_json(j) FROM public.claim_account_deletion_job('{u}',true) j"))
 second.send(f"SELECT row_to_json(j) FROM public.claim_account_deletion_job('{u}',true) j;")
 c.waiting(second,first);first.finish()
 competing=json.loads(second.run('SELECT 1').splitlines()[0]);second.finish()
 c.check(initial['claimed'] and not competing['claimed'],'concurrent deletion worker cannot take an active claim')
 c.check(c.sql(f"SELECT claim_token FROM public.account_deletion_jobs WHERE user_id='{u}'")==initial['claim_token'],'competing worker leaves claim fence intact')
print(json.dumps({'passed':len(c.results)}))
