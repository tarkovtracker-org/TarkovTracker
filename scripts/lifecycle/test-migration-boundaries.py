"""Real CLI migration transactions against a positively identified disposable stack only."""
import json, pathlib, shutil, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parents[2]
STAGE=pathlib.Path('/tmp/tt-b-http')
import tempfile
PHASE=pathlib.Path(tempfile.mkdtemp(prefix='tt-b-final-boundaries-'))
OUT=pathlib.Path('/tmp/tt-b-delivery-final');OUT.mkdir(mode=0o700,exist_ok=True)
CONTAINER='supabase_db_tt-b-http-disposable'
labels=json.loads(subprocess.check_output(['docker','inspect',CONTAINER,'--format','{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project']=='tt-b-http-disposable' and labels['com.supabase.cli.workdir']==str(STAGE)
config=json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text())
assert config['DB_URL']=='postgresql://postgres:postgres@127.0.0.1:59322/postgres'
CMD=['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):return subprocess.check_output(CMD,input=q,text=True).strip()
assert sql("SELECT max(version) FROM supabase_migrations.schema_migrations")=='20260912085904','Start from exact disposable A+C boundary'
assert not (PHASE/'supabase').exists(),'Use a fresh phase workspace'
(PHASE/'supabase/migrations').mkdir(parents=True)
shutil.copy2(STAGE/'supabase/config.toml',PHASE/'supabase/config.toml')
for f in (ROOT/'supabase/migrations').glob('*.sql'):
 if f.name.split('_')[0]<='20260912085904':shutil.copy2(f,PHASE/'supabase/migrations'/f.name)
steps=[('20260914092616_lifecycle_unlink_bootstrap.sql','auth.identities','private.lifecycle_bootstrap_discord'),('20260912190000_billing_initiation_bootstrap.sql','pg_catalog.pg_proc','private.provider_initiations'),('20260912201429_provider_lifecycle_foundation.sql','public.supporters','private.lifecycle_requests'),('20260914074055_lifecycle_delivery_controls.sql','public.account_deletion_jobs','private.lifecycle_delivery_controls'),('20260914074830_lifecycle_delivery_eligibility.sql','private.lifecycle_requests','private.lifecycle_delivery_eligibility'),('20260914092617_lifecycle_bootstrap_handoff.sql','private.lifecycle_bootstrap_discord','public.handoff_bootstrap_discord(integer)'),('20260915032640_lifecycle_delivery_leases.sql','private.lifecycle_delivery_invocations','public.renew_lifecycle_delivery(uuid)'),('20260915032641_lifecycle_canonical_capture.sql','auth.identities',None),('20260916025544_final_billing_truth.sql','private.provider_initiations','private.final_billing_verifications')]
results=[]
for filename,locked,created in steps:
 shutil.copy2(ROOT/'supabase/migrations'/filename,PHASE/'supabase/migrations'/filename)
 before=sql("SELECT pg_get_functiondef('public.delete_discord_account_link()'::regprocedure)")
 lock_cmd=CMD.copy()
 if locked.startswith('pg_catalog.'):
  lock_cmd[lock_cmd.index('postgres')]='supabase_admin' # disposable catalog-lock fixture only
 held=subprocess.Popen(lock_cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 lock_mode='SHARE' if locked.startswith('pg_catalog.') else 'ACCESS EXCLUSIVE'
 held.stdin.write(f'BEGIN; LOCK TABLE {locked} IN {lock_mode} MODE;\n\\echo HELD\n');held.stdin.flush()
 assert held.stdout.readline().strip()=='HELD'
 args=[str(ROOT/'node_modules/.bin/supabase'),'db','push','--local','--include-all','--skip-vault','--yes','--workdir',str(PHASE)]
 started=time.monotonic()
 try:
  with (OUT/(filename+'.failure.log')).open('w') as log:failed=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,timeout=45)
  elapsed=round(time.monotonic()-started,3)
 finally:
  held.stdin.write('ROLLBACK;\n');held.stdin.close();held.wait(timeout=5)
 failure=(OUT/(filename+'.failure.log')).read_text()
 assert failed.returncode!=0 and 'lock timeout' in failure
 version=filename.split('_')[0]
 assert sql(f"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='{version}'")=='0'
 if created:
  catalog='to_regprocedure' if '(' in created else 'to_regclass'
  assert sql(f"SELECT {catalog}('{created}') IS NULL")=='t'
 else:
  assert sql("SELECT pg_get_functiondef('public.delete_discord_account_link()'::regprocedure)")==before
 with (OUT/(filename+'.retry.log')).open('w') as log:retry=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,timeout=45)
 assert retry.returncode==0
 assert sql(f"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='{version}'")=='1'
 if filename.startswith('20260914092616'):
  with (OUT/'bootstrap-auth-upgrade.log').open('w') as log:
   tested=subprocess.run(['python3',str(ROOT/'tests/supabase/bootstrap-unlink-http.py')],stdout=log,stderr=subprocess.STDOUT,timeout=60)
  assert tested.returncode==0,'Real Auth bootstrap transport failed'
 results.append({'migration':filename,'bounded_failure_seconds':elapsed,'schema_rollback':True,'history_not_advanced_on_failure':True,'retry':'PASS'})
print(json.dumps({'target':'disposable','steps':results,'production_changes':0}))
(OUT/'migration-boundaries-final.json').write_text(json.dumps(results,indent=2)+'\n')

(OUT/'operational-unlink-definition.sql').write_text(sql("SELECT pg_get_functiondef('public.delete_discord_account_link()'::regprocedure)")+'\n')
assert sql("SELECT count(*) FROM cron.job WHERE jobname ~* 'lifecycle|provider|account.?delet' AND NOT (jobname='account-deletion-attempts-cleanup' AND schedule='45 3 * * *' AND command='SELECT public.cleanup_old_deletion_attempts(89)')")=='0'
assert sql("SELECT bool_and(NOT enabled) FROM private.lifecycle_delivery_controls")=='t'
print('PASS final controls OFF; no lifecycle/provider/account deletion schedule')
