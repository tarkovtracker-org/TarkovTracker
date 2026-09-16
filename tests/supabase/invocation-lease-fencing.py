"""Real Postgres invocation/task fencing. Synthetic clock fault injection is explicit.
No provider HTTP. Expiry without clock edits is separately covered by worker-invocation-crash.py.
"""
import json,pathlib,subprocess,uuid,time
C='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.workdir']=='/tmp/tt-b-http' and labels['com.supabase.cli.project']=='tt-b-http-disposable'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
checks=[]
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
def check(ok,label):
 assert ok,label
 checks.append(label)
def rpc(inv,q):return "BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='"+json.dumps({'x-lifecycle-delivery':inv})+"'; "+q+"; COMMIT;"
def rejected(inv,q):
 p=subprocess.run(CMD,input=rpc(inv,q),text=True,capture_output=True)
 return p.returncode!=0 and ('invocation' in p.stderr.lower() or '40001' in p.stderr)
def status():return next(x for x in json.loads(sql('SELECT public.lifecycle_delivery_status()')) if x['component']=='provider_processing')
def enable(v):sql("SELECT public.set_lifecycle_delivery('provider_processing',"+str(v).lower()+",'synthetic lease regression')")
def expire(inv):sql(f"UPDATE private.lifecycle_delivery_invocations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='{inv}'")
assert sql("SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()")=='0'
try:
 enable(True);a=sql("SELECT public.begin_lifecycle_delivery('provider_processing')");uuid.UUID(a)
 check(sql(f"SELECT round(extract(epoch FROM deadline_at-started_at))=60 AND round(extract(epoch FROM expires_at-started_at))=30 FROM private.lifecycle_delivery_invocations WHERE id='{a}'")=='t','30 second lease, 60 second immutable deadline')
 check(sql("SELECT public.begin_lifecycle_delivery('provider_processing') IS NULL")=='t','single flight')
 check(sql(f"SELECT public.renew_lifecycle_delivery('{a}')")=='t','healthy renewal')
 enable(False);check(status()['active']==1 and not status()['enabled'],'disabled but draining')
 check(sql("SELECT public.begin_lifecycle_delivery('provider_processing') IS NULL")=='t','paused admission denied')
 expire(a);check(status()['active']==0 and status()['expired']>=1,'expired does not block drain')
 check(sql(f"SELECT public.renew_lifecycle_delivery('{a}')")=='f','expired cannot renew')
 check(sql(f"SELECT public.finish_lifecycle_delivery('{a}')")=='f','expired cannot finish')
 check(rejected(a,"SELECT public.claim_lifecycle_work('stripe_cleanup',1)"),'expired cannot claim')
 enable(True);b=sql("SELECT public.begin_lifecycle_delivery('provider_processing')");check(a!=b,'new owner after expiry')
 check(sql(f"SELECT NOT public.finish_lifecycle_delivery('{a}') AND public.lifecycle_delivery_valid('{b}')")=='t','stale release cannot clear new owner')
 task=str(uuid.uuid4())
 sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,action) VALUES('{task}','stripe_cleanup','synthetic-lease-{task}','cancel_at_period_end'); UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{task}'")
 sql(rpc(b,"SELECT id FROM public.claim_lifecycle_work('stripe_cleanup',1)"))
 token=sql(f"SELECT claim_token FROM private.lifecycle_work WHERE id='{task}'")
 check(sql(f"SELECT delivery_invocation='{b}' FROM private.lifecycle_work WHERE id='{task}'")=='t','task binds invocation')
 sql("BEGIN; SET LOCAL request.headers='"+json.dumps({'x-lifecycle-delivery':b})+f"'; UPDATE private.lifecycle_work SET lease_until=clock_timestamp()-interval '1 second' WHERE id='{task}'; COMMIT;")
 expire(b)
 check(rejected(b,f"SELECT public.finish_lifecycle_work('{task}','{token}','completed')"),'expired cannot complete task')
 c=sql("SELECT public.begin_lifecycle_delivery('provider_processing')")
 check(sql(rpc(c,f"SELECT (public.lifecycle_work_status('{task}','{token}')->>'valid_claim')::boolean"))=='f','new invocation cannot borrow old task token')
 sql(rpc(c,"SELECT id FROM public.claim_lifecycle_work('stripe_cleanup',1)"))
 newtoken=sql(f"SELECT claim_token FROM private.lifecycle_work WHERE id='{task}'")
 check(newtoken!=token,'reclaimed task has new token')
 check(sql(rpc(c,f"SELECT public.finish_lifecycle_work('{task}','{token}','completed')"))=='f','old task token rejected')
 check(sql(rpc(c,f"SELECT public.finish_lifecycle_work('{task}','{newtoken}','completed')"))=='t','new owner completes once')
 check(sql(rpc(c,f"SELECT public.finish_lifecycle_work('{task}','{newtoken}','completed')"))=='f','duplicate completion false')
 sql(f"SELECT public.finish_lifecycle_delivery('{c}')")
 # Real separate transaction: a write is allowed at entry, then deferred COMMIT fence rejects it.
 d=sql("SELECT public.begin_lifecycle_delivery('provider_processing')")
 sql(f"UPDATE private.lifecycle_delivery_invocations SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id='{d}'")
 probe=str(uuid.uuid4());p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 header=json.dumps({'x-lifecycle-delivery':d})
 p.stdin.write(f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.headers='{header}'; SELECT public.receive_stripe_lifecycle('synthetic-commit-{probe}','synthetic.test');\n\\echo READY\n");p.stdin.flush()
 while p.stdout.readline().strip()!='READY':
  assert p.poll() is None,'Transaction failed before barrier'
 until=time.monotonic()+4
 while sql(f"SELECT expires_at>clock_timestamp() FROM private.lifecycle_delivery_invocations WHERE id='{d}'")=='t':
  assert time.monotonic()<until;time.sleep(.05)
 p.stdin.write('COMMIT;\n');p.stdin.close();p.wait(timeout=5)
 check(p.returncode!=0 and 'expired' in p.stderr.read(),'commit after expiry aborts real transaction')
 check(sql(f"SELECT count(*) FROM private.lifecycle_work WHERE dedupe_key='synthetic-commit-{probe}'")=='0','expired transaction leaves no receipt/inbox split')
 check(rejected(d,"SELECT public.claim_stripe_lifecycle('synthetic-none','synthetic.test')"),'expired empty Stripe claim rejected')
 check(not __import__('re').search(r'cus_|sub_|discord_id|resource_id|token',json.dumps(status())),'status contains no provider identifiers or tokens')
 print(json.dumps({'passed':len(checks),'failed':0,'checks':checks,'fault_injection':'synthetic lease timestamp expiry except commit barrier uses DB time','provider_calls':0,'production_changes':0}))
finally:enable(False)
