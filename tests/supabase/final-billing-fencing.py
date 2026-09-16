"""Disposable PostgreSQL proof-expiry lock interleaving; no provider/Auth calls."""
import json,subprocess,time,uuid
C='supabase_db_tt-b-http-disposable'
l=json.loads(subprocess.check_output(['docker','inspect',C,'--format','{{json .Config.Labels}}']))
assert l['com.supabase.cli.workdir']=='/tmp/tt-b-http' and l['com.supabase.cli.project']=='tt-b-http-disposable'
CMD=['docker','exec','-i',C,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
assert sql('SELECT count(*) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL AND expires_at>clock_timestamp()')=='0'
u=str(uuid.uuid4());claim=str(uuid.uuid4());checks=0
try:
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic truth fencing'); SELECT public.set_lifecycle_delivery('deletion_reconcile',true,'synthetic truth fencing')")
 sql("INSERT INTO private.billing_application_cutovers(confirmed_at,checkout_source_hash,portal_source_hash,evidence_reference) VALUES(clock_timestamp()-interval '25 hours',repeat('a',64),repeat('b',64),'synthetic clock for proof tests')")
 sql(f"INSERT INTO private.lifecycle_requests(user_id,state,snapshot_captured) VALUES('{u}','prepared',true); INSERT INTO public.account_deletion_jobs(user_id,status,claim_token) VALUES('{u}','in_progress','{claim}')")
 context=json.loads(sql(f"SELECT public.begin_final_billing_verification('{u}','{claim}')"));assert context['status']=='checking'
 assert sql(f"SELECT public.finish_final_billing_verification('{u}','{claim}','{context['token']}','clear')")=='t';checks+=1
 held=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 held.stdin.write(f"BEGIN; SELECT user_id IS NOT NULL FROM public.account_deletion_jobs WHERE user_id='{u}' FOR UPDATE;\n\\echo HELD\n");held.stdin.flush()
 while held.stdout.readline().strip()!='HELD':assert held.poll() is None
 sql(f"UPDATE private.final_billing_verifications SET expires_at=clock_timestamp()+interval '2 seconds' WHERE user_id='{u}'")
 other=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 started=time.monotonic();other.stdin.write(f"SET application_name='synthetic-truth-authorize'; SELECT public.authorize_account_auth_delete('{u}','{claim}');\n");other.stdin.close()
 deadline=time.monotonic()+3
 while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='synthetic-truth-authorize' AND wait_event_type='Lock'")!='1':
  assert time.monotonic()<deadline;time.sleep(.01)
 checks+=1
 while sql(f"SELECT expires_at>clock_timestamp() FROM private.final_billing_verifications WHERE user_id='{u}'")=='t':time.sleep(.02)
 held.stdin.write('ROLLBACK;\n');held.stdin.close();held.wait(timeout=2)
 other.wait(timeout=5);assert other.returncode==0,other.stderr.read();assert other.stdout.read().strip()=='f';checks+=1
 assert sql(f"SELECT state FROM private.lifecycle_requests WHERE user_id='{u}'")=='prepared';checks+=1
 # Resume routing must also recheck the claim after waiting for its user lock.
 held=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 held.stdin.write(f"BEGIN; SELECT private.lifecycle_user_lock('{u}');\n\\echo HELD\n");held.stdin.flush()
 while held.stdout.readline().strip()!='HELD':assert held.poll() is None
 sql(f"UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp()-interval '15 minutes'+interval '2 seconds' WHERE user_id='{u}'")
 other=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 other.stdin.write(f"SET application_name='synthetic-truth-resume'; SELECT public.account_deletion_resume_stage('{u}','{claim}');\n");other.stdin.close()
 deadline=time.monotonic()+3
 while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='synthetic-truth-resume' AND wait_event_type='Lock'")!='1':
  assert time.monotonic()<deadline;time.sleep(.01)
 checks+=1
 while sql(f"SELECT updated_at>clock_timestamp()-interval '15 minutes' FROM public.account_deletion_jobs WHERE user_id='{u}'")=='t':time.sleep(.02)
 held.stdin.write('ROLLBACK;\n');held.stdin.close();held.wait(timeout=2)
 other.wait(timeout=5);assert other.returncode==0,other.stderr.read();assert other.stdout.read().strip()=='lease_lost';checks+=1
 print(json.dumps({'passed':checks,'failed':0,'actual_lock_wait_seconds':round(time.monotonic()-started,3),'auth_calls':0,'production_changes':0}))
finally:
 sql("SELECT public.set_lifecycle_delivery('deletion_intake',false,'synthetic truth fencing complete'); SELECT public.set_lifecycle_delivery('deletion_reconcile',false,'synthetic truth fencing complete')")
