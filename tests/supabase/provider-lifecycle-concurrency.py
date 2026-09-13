"""Deterministic real PostgreSQL sessions; fixed disposable target, synthetic fixtures only."""
import concurrent.futures,json,pathlib,subprocess,time,uuid
C='supabase_db_tt-b-http-disposable'; ROOT='/tmp/tt-b-http'
labels=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.workdir']==ROOT and labels['com.supabase.cli.project']=='tt-b-http-disposable'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
assert sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260912201429'")=='1'
results=[]
def check(v,label,**data):
 assert v,(label,data)
 results.append({'test':label,**data});print('PASS',label,json.dumps(data),flush=True)
class Session:
 def __init__(self):
  self.name='b-'+uuid.uuid4().hex;self.p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  self.send("SET application_name='"+self.name+"'; SET statement_timeout='12s'; BEGIN;")
 def send(self,q):self.p.stdin.write(q+'\n');self.p.stdin.flush()
 def run(self,q):
  mark='end_'+uuid.uuid4().hex;self.send(q.rstrip(';')+';\n\\echo '+mark);lines=[]
  while True:
   line=self.p.stdout.readline()
   if not line:raise RuntimeError(self.p.stderr.read())
   if line.strip()==mark:return '\n'.join(lines).strip()
   lines.append(line.strip())
 def finish(self,commit=True):
  if self.p.poll() is None:
   self.send('COMMIT;' if commit else 'ROLLBACK;');self.p.stdin.close();self.p.wait(timeout=5)
 def __enter__(self):return self
 def __exit__(self,*args):self.finish(False)
def waiting(s,blocker):
 deadline=time.monotonic()+4
 while time.monotonic()<deadline:
  if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{s.name}' AND wait_event_type='Lock' AND (SELECT pid FROM pg_stat_activity WHERE application_name='{blocker.name}')=ANY(pg_blocking_pids(pid))")=='1':return
  if s.p.poll() is not None:raise RuntimeError('worker exited')
  time.sleep(.02)
 raise AssertionError('no proven lock wait')

# UUIDs are synthetic and private work deliberately has no Auth foreign key.
user=str(uuid.uuid4())
sql(f"INSERT INTO private.lifecycle_requests(user_id) VALUES('{user}'); INSERT INTO private.lifecycle_work(kind,dedupe_key,user_id,generation,resource_id,action) SELECT 'discord_cleanup','deletion:'||generation::text||':early','{user}',generation,'synthetic-discord','remove_managed_roles' FROM private.lifecycle_requests WHERE user_id='{user}';")
standalone=sql(f"INSERT INTO private.lifecycle_work(kind,dedupe_key,user_id,resource_id,action) VALUES('discord_cleanup','unlink:{uuid.uuid4()}','{user}','synthetic-discord','remove_managed_roles') RETURNING id")
sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{standalone}'")
claimed=json.loads(sql("SELECT row_to_json(w) FROM public.claim_lifecycle_work('discord_cleanup',1) w"))
check(claimed['id']==standalone,'unsealed deletion task does not starve standalone unlink')
check(sql(f"SELECT public.finish_lifecycle_work('{standalone}','{uuid.uuid4()}','completed')")=='f','stale worker completion denied')
check(sql(f"SELECT public.finish_lifecycle_work('{standalone}','{claimed['claim_token']}','completed')")=='t','valid worker completes once')
check(sql(f"SELECT public.finish_lifecycle_work('{standalone}','{claimed['claim_token']}','completed')")=='f','duplicate completion has no effect')
parent=str(uuid.uuid4()); children=[str(uuid.uuid4()),str(uuid.uuid4())]; tokens=[str(uuid.uuid4()),str(uuid.uuid4())]
sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,resource_id,action,state) VALUES('{parent}','stripe_event','evt_{parent}','evt_synthetic','synthetic','waiting')")
for child,token in zip(children,tokens):
 sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,resource_id,action,state,claim_token,lease_until,parent_id) VALUES('{child}','discord_cleanup','child:{child}','synthetic','remove_managed_roles','processing','{token}',clock_timestamp()+interval '2 minutes','{parent}')")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 with Session() as a, Session() as b:
  result=a.run(f"SELECT public.finish_lifecycle_work('{children[0]}','{tokens[0]}','completed')");check(result=='t','first child completes inside held transaction',actual=result)
  f=pool.submit(b.run,f"SELECT public.finish_lifecycle_work('{children[1]}','{tokens[1]}','completed')")
  waiting(b,a)
  otherparent=str(uuid.uuid4());otherchild=str(uuid.uuid4());othertoken=str(uuid.uuid4())
  sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,resource_id,action,state) VALUES('{otherparent}','stripe_event','evt_{otherparent}','evt_synthetic','synthetic','waiting'); INSERT INTO private.lifecycle_work(id,kind,dedupe_key,resource_id,action,state,claim_token,lease_until,parent_id) VALUES('{otherchild}','discord_cleanup','child:{otherchild}','synthetic','remove_managed_roles','processing','{othertoken}',clock_timestamp()+interval '2 minutes','{otherparent}')")
  started=time.monotonic()
  check(sql(f"SET statement_timeout='2s'; SELECT public.finish_lifecycle_work('{otherchild}','{othertoken}','completed')")=='t','unrelated parent completes while first parent remains locked',elapsed_ms=round((time.monotonic()-started)*1000))
  a.finish(True)
  check(f.result(timeout=6)=='t','second child waits on actual parent lock then completes');b.finish(True)
check(sql(f"SELECT state FROM private.lifecycle_work WHERE id='{parent}'")=='completed','concurrent final children cannot strand parent')
# Prove lease expiration permits recovery but rejects the old claim.
item=str(uuid.uuid4());old=str(uuid.uuid4())
sql(f"INSERT INTO private.lifecycle_work(id,kind,dedupe_key,resource_id,action,state,claim_token,lease_until) VALUES('{item}','discord_cleanup','expired:{item}','synthetic','remove_managed_roles','processing','{old}',clock_timestamp()-interval '1 second')")
sql(f"UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='{item}'")
w=json.loads(sql("SELECT row_to_json(w) FROM public.claim_lifecycle_work('discord_cleanup',1) w"))
check(w['id']==item and w['claim_token']!=old,'expired claim is recoverable with new fence')
check(sql(f"SELECT public.finish_lifecycle_work('{item}','{old}','completed')")=='f','expired worker cannot finish newer claim')
check(sql(f"SELECT public.finish_lifecycle_work('{item}','{w['claim_token']}','completed')")=='t','replacement worker completes')
# Private state and service-only endpoints are not available to API users.
for role in ['anon','authenticated']:
 check(sql(f"SELECT has_function_privilege('{role}','public.claim_lifecycle_work(text,integer)','EXECUTE')")=='f',role+' cannot claim provider tasks')
 check(sql(f"SELECT has_table_privilege('{role}','private.lifecycle_work','SELECT')")=='f',role+' cannot read provider identifiers')
print(json.dumps({'passed':len(results),'results':results}))
