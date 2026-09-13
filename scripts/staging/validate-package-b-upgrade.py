"""Explicit disposable A+C upgrade, bounded conflict rollback, then clean retry."""
import json,pathlib,subprocess,time
source=pathlib.Path(__file__).resolve().parents[2]
subprocess.run(['python',str(source/'scripts/staging/reset-package-b.py'),'--through-ac'],check=True)
evidence=pathlib.Path('/tmp/tt-b-lifecycle-validation')
cli=[str(source/'node_modules/.bin/supabase'),'migration','up','--local','--workdir','/tmp/tt-b-http']
psql=['docker','exec','-i','supabase_db_tt-b-http-disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(query):return subprocess.check_output(psql,input=query,text=True).strip()
def require(value,message):
 if not value:raise RuntimeError(message)
require(sql("SELECT max(version) FROM supabase_migrations.schema_migrations")=='20260912085904','Unexpected upgrade boundary')
sql("INSERT INTO public.stripe_events(event_id,event_type,received_at) SELECT 'evt_upgrade_legacy_'||n,'synthetic',clock_timestamp()-interval '1 year' FROM generate_series(1,4) n")
lock=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 lock.stdin.write("BEGIN; LOCK TABLE public.supporters IN ACCESS EXCLUSIVE MODE;\n\\echo LOCKED\n");lock.stdin.flush()
 require(lock.stdout.readline().strip()=='LOCKED','Lock was not acquired')
 started=time.monotonic()
 with (evidence/'upgrade-lock-failure-final.log').open('w') as log:failed=subprocess.run(cli,stdout=log,stderr=subprocess.STDOUT,timeout=45)
 elapsed=time.monotonic()-started
 require(failed.returncode!=0,'Expected bounded lock failure')
 require('55P03' in (evidence/'upgrade-lock-failure-final.log').read_text(),'Unexpected failure classification')
 require(elapsed<15,'Lock failure not bounded')
 require(sql("SELECT to_regclass('private.lifecycle_requests') IS NULL AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260912201429')")=='t','Partial migration/schema state')
finally:
 lock.stdin.write('ROLLBACK;\n');lock.stdin.flush();lock.stdin.close();lock.wait(timeout=10)
with (evidence/'upgrade-clean-retry-final.log').open('w') as log:subprocess.run(cli,stdout=log,stderr=subprocess.STDOUT,timeout=45,check=True)
require(sql("SELECT to_regclass('private.lifecycle_requests') IS NOT NULL AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260912201429')")=='t','Clean retry failed verification')
require(sql("SELECT count(*) FROM public.stripe_events WHERE event_id LIKE 'evt_upgrade_legacy_%'")=='4','Legacy receipts changed during migration')
require(sql("SELECT count(*) FROM private.lifecycle_work")=='0','Migration manufactured processing/completion/replay work')
result={'lock_failure_seconds':round(elapsed,3),'failure_exit':failed.returncode,'clean_rollback_verified':True,'clean_retry_exit':0}
(evidence/'upgrade-results-final.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
