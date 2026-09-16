"""Synthetic control-only database test. Never accepts a remote database URL."""
import json
import subprocess
import threading
import time
from pathlib import Path

CONTAINER = 'supabase_db_tt-b-http-disposable'
DATABASE = 'tt_b_delivery_controls'
labels = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER, '--format', '{{json .Config.Labels}}']))
assert labels['com.supabase.cli.project'] == 'tt-b-http-disposable'
assert labels['com.supabase.cli.workdir'] == '/tmp/tt-b-http'
COMMAND = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1']
def query(sql):
    return subprocess.check_output(COMMAND, input=sql, text=True).strip()

class Session:
    def __init__(self):
        self.process = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    def run(self, sql):
        self.process.stdin.write(sql + '\n\\echo __barrier__\n')
        self.process.stdin.flush()
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError('Database session failed')
            if line.strip() == '__barrier__':
                return '\n'.join(lines)
            lines.append(line.strip())
    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=5)

# This dedicated test DB has no application/provider data or provider integrations.
query("SELECT public.set_lifecycle_delivery('deletion_intake',true,'synthetic-test');")
a = Session()
a.run("BEGIN; SELECT public.begin_lifecycle_delivery('deletion_intake');")
result = {}
def close_admission():
    start = time.monotonic()
    result['value'] = query("SET application_name='delivery_disable_test'; SELECT public.set_lifecycle_delivery('deletion_intake',false,'synthetic-race');")
    result['seconds'] = round(time.monotonic() - start, 4)
t = threading.Thread(target=close_admission)
t.start()
deadline = time.monotonic() + 0.8
observed = False
while time.monotonic() < deadline:
    observed = query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='delivery_disable_test' AND wait_event_type='Lock');") == 't'
    if observed:
        break
assert observed, 'Explicit lock barrier was not observed'
a.run('COMMIT;')
t.join(timeout=3)
assert not t.is_alive() and 'seconds' in result
assert query("SELECT public.begin_lifecycle_delivery('deletion_intake') IS NULL;") == 't'
status = json.loads(query('SELECT public.lifecycle_delivery_status();'))
row = next(x for x in status if x['component'] == 'deletion_intake')
assert row['enabled'] is False and row['active'] >= 1  # closed does NOT falsely report drained
query("SELECT public.finish_lifecycle_delivery(id) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL;")
assert json.loads(query('SELECT public.lifecycle_delivery_status();'))[0]['active'] == 0
# Default-disabled provider and single-flight after explicit synthetic enable.
assert query("SELECT public.begin_lifecycle_delivery('provider_processing') IS NULL;") == 't'
query("SELECT public.set_lifecycle_delivery('provider_processing',true,'synthetic-test');")
assert query("SELECT public.begin_lifecycle_delivery('provider_processing') IS NOT NULL;") == 't'
assert query("SELECT public.begin_lifecycle_delivery('provider_processing') IS NULL;") == 't'
query("SELECT public.finish_lifecycle_delivery(id) FROM private.lifecycle_delivery_invocations WHERE finished_at IS NULL;")
query("SELECT public.set_lifecycle_delivery('provider_processing',false,'synthetic-test');")
# Real conflicting row lock causes bounded rollback, no control/audit change.
a.run("BEGIN; SELECT 1 FROM private.lifecycle_delivery_controls WHERE component='deletion_intake' FOR UPDATE;")
before = query('SELECT count(*) FROM private.lifecycle_delivery_audit;')
start = time.monotonic()
failed = subprocess.run(COMMAND, input="BEGIN; SELECT public.set_lifecycle_delivery('deletion_intake',true,'must-rollback'); COMMIT;", text=True, capture_output=True)
wait = round(time.monotonic() - start, 4)
assert failed.returncode != 0 and 'lock timeout' in failed.stderr
assert query('SELECT count(*) FROM private.lifecycle_delivery_audit;') == before
a.run('ROLLBACK;')
query("SELECT public.set_lifecycle_delivery('deletion_intake',true,'bounded-retry');")
for role in ['anon', 'authenticated', 'service_role']:
    assert query(f"SELECT has_function_privilege('{role}','public.set_lifecycle_delivery(text,boolean,text)','EXECUTE');") == 'f'
for role in ['anon', 'authenticated']:
    assert query(f"SELECT has_function_privilege('{role}','public.begin_lifecycle_delivery(text)','EXECUTE');") == 'f'
a.close()
print(json.dumps({'admission_disable_race':'PASS','lock_wait_observed':True,'disable_wait_seconds':result['seconds'],'drain_visibility':'PASS','provider_default_off_single_flight':'PASS','lock_timeout_rollback_retry':'PASS','timeout_seconds':wait,'client_and_service_control_acl':'PASS','production_changes':0}))
