"""Local-only A+C billing bootstrap + full B schema smoke; no provider calls."""
import json
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
STAGE = pathlib.Path('/tmp/tt-b-http')
CONTAINER = 'supabase_db_tt-b-http-disposable'
labels = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER, '--format', '{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project'] == 'tt-b-http-disposable'
assert labels['com.supabase.cli.workdir'] == str(STAGE)
CMD = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
def sql(query):
    return subprocess.check_output(CMD, input=query, text=True).strip()
def check(query, expected, label):
    assert sql(query) == expected, label
    print('PASS ' + label, flush=True)
assert sql('SELECT max(version) FROM supabase_migrations.schema_migrations') == '20260912085904'
phase = pathlib.Path(tempfile.mkdtemp(prefix='tt-billing-bootstrap-'))
(phase / 'supabase/migrations').mkdir(parents=True)
shutil.copy2(STAGE / 'supabase/config.toml', phase / 'supabase/config.toml')
for file in (ROOT / 'supabase/migrations').glob('*.sql'):
    if file.name.split('_')[0] <= '20260912085904':
        shutil.copy2(file, phase / 'supabase/migrations' / file.name)
def apply(name):
    shutil.copy2(ROOT / 'supabase/migrations' / name, phase / 'supabase/migrations' / name)
    with (phase / (name + '.log')).open('w') as log:
        result = subprocess.run([str(ROOT / 'node_modules/.bin/supabase'), 'db', 'push', '--local', '--include-all', '--skip-vault', '--yes', '--workdir', str(phase)], stdout=log, stderr=subprocess.STDOUT, timeout=60)
    assert result.returncode == 0, str(phase / (name + '.log'))
    print('PASS applied ' + name, flush=True)
apply('20260912190000_billing_initiation_bootstrap.sql')
check("SELECT to_regclass('private.lifecycle_requests') IS NULL", 't', 'bootstrap works before lifecycle schema')
check("SELECT NOT has_table_privilege('authenticated','private.provider_initiations','INSERT') AND NOT has_table_privilege('service_role','private.provider_initiations','INSERT')", 't', 'no direct client or service reservation writes')
check("SELECT NOT has_function_privilege('authenticated','public.reserve_provider_initiation(uuid,text,text,text)','EXECUTE') AND has_function_privilege('service_role','public.reserve_provider_initiation(uuid,text,text,text)','EXECUTE')", 't', 'reservation service RPC only')
uid = '10101010-1010-4010-8010-101010101010'
check(f"BEGIN; SET LOCAL ROLE service_role; SELECT public.reserve_provider_initiation('{uid}','checkout','synthetic')=public.reserve_provider_initiation('{uid}','checkout','synthetic'); ROLLBACK;", 't', 'pre-foundation duplicate checkout uses same reservation')
check(f"BEGIN; SET LOCAL ROLE service_role; SELECT public.record_provider_initiation(public.reserve_provider_initiation('{uid}','portal','synthetic','cus_synthetic'),'bps_synthetic'); ROLLBACK;", 't', 'pre-foundation portal association')
check("SELECT NOT private.billing_application_horizon_elapsed()", 't', 'missing cutover fails closed')
check("SELECT NOT has_function_privilege('service_role','public.confirm_billing_application_cutover(text,text,text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.confirm_billing_application_cutover(text,text,text)','EXECUTE')", 't', 'operator cutover cannot be set by client or service')
check("BEGIN; SELECT public.confirm_billing_application_cutover(repeat('a',64),repeat('b',64),'synthetic verification')<=clock_timestamp(); SELECT NOT private.billing_application_horizon_elapsed(); ROLLBACK;", 't\nt', 'operator records server time without shortening horizon')
steps = ['20260914092616_lifecycle_unlink_bootstrap.sql','20260912201429_provider_lifecycle_foundation.sql','20260914074055_lifecycle_delivery_controls.sql','20260914074830_lifecycle_delivery_eligibility.sql','20260914092617_lifecycle_bootstrap_handoff.sql','20260915032640_lifecycle_delivery_leases.sql','20260915032641_lifecycle_canonical_capture.sql','20260916025544_final_billing_truth.sql']
for step in steps:
    apply(step)
check("SELECT bool_and(NOT enabled) FROM private.lifecycle_delivery_controls", 't', 'all final processing controls remain closed')
check(f"BEGIN; INSERT INTO private.lifecycle_requests(user_id) VALUES('{uid}'); DO $$ BEGIN UPDATE private.lifecycle_requests SET state='sealed' WHERE user_id='{uid}'; RAISE EXCEPTION 'guard missing'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END $$; SELECT state FROM private.lifecycle_requests WHERE user_id='{uid}'; ROLLBACK;", 'requested', 'irreversible state rejected without recorded cutoff')
check("BEGIN; INSERT INTO private.billing_application_cutovers(confirmed_at,checkout_source_hash,portal_source_hash,evidence_reference) VALUES(clock_timestamp()-interval '23 hours',repeat('a',64),repeat('b',64),'synthetic clock'); SELECT NOT private.billing_application_horizon_elapsed(); ROLLBACK;", 't', '23-hour horizon remains blocked')
check("BEGIN; INSERT INTO private.billing_application_cutovers(confirmed_at,checkout_source_hash,portal_source_hash,evidence_reference) VALUES(clock_timestamp()-interval '25 hours',repeat('a',64),repeat('b',64),'synthetic clock'); SELECT private.billing_application_horizon_elapsed(); SELECT public.billing_application_cutover_status()->>'provider_clearance'; ROLLBACK;", 't\nfalse', 'elapsed horizon is never provider clearance')
check("SELECT count(*) FROM cron.job WHERE jobname ~* 'lifecycle|provider|account.?delet' AND jobname<>'account-deletion-attempts-cleanup'", '0', 'no worker schedule introduced')
print('PASS local bootstrap and horizon assertions; current-provider verification remains separate/unvalidated')
