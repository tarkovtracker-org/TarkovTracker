"""Fixed disposable target only. Fail closed before copying/resetting; no provider calls."""
import argparse
import json
import os
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path('/tmp/tt-b-http')
SOURCE = pathlib.Path(__file__).resolve().parents[2]
EVIDENCE = pathlib.Path('/tmp/tt-b-lifecycle-validation')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


parser = argparse.ArgumentParser()
parser.add_argument('--through-ac', action='store_true')
options = parser.parse_args()
STATUS = json.loads(pathlib.Path('/tmp/tt-b-status.json').read_text())
require(STATUS['API_URL'] == 'http://127.0.0.1:59321', 'Unexpected API target')
require(STATUS['DB_URL'] == 'postgresql://postgres:postgres@127.0.0.1:59322/postgres', 'Unexpected database target')
require(ROOT.resolve() == ROOT and ROOT.stat().st_uid == os.getuid(), 'Untrusted disposable directory')
container = 'supabase_db_tt-b-http-disposable'
labels = json.loads(subprocess.check_output(['docker', 'inspect', container, '--format', '{{json .Config.Labels}}']))
require(labels['com.supabase.cli.project'] == 'tt-b-http-disposable', 'Unexpected container project')
require(labels['com.supabase.cli.workdir'] == str(ROOT), 'Unexpected container workdir')
require(not (ROOT / 'supabase/functions/.env').exists(), 'Provider environment file present')
require(not (SOURCE / 'supabase/functions/.env').exists(), 'Source provider environment file present')
containers = subprocess.check_output(['docker', 'ps', '-aq', '--filter', 'label=com.supabase.cli.project=tt-b-http-disposable']).decode().split()
allowed_provider_env = {
    'STRIPE_SECRET_KEY': 'sk_test_synthetic_edge_only',
    'STRIPE_WEBHOOK_SECRET': 'whsec_synthetic_edge_only',
}
for tier in ['SCAV', 'TIMMY', 'CHAD']:
    for term in ['MONTHLY', '6MONTH', 'YEARLY']:
        allowed_provider_env[f'STRIPE_PRICE_{tier}_{term}'] = f'price_{tier}_{term}'
for identifier in containers:
    entries = json.loads(subprocess.check_output(['docker', 'inspect', identifier, '--format', '{{json .Config.Env}}'])) or []
    env = dict(item.split('=', 1) for item in entries)
    for key, value in env.items():
        if key.startswith(('STRIPE_', 'DISCORD_')) and value:
            require(allowed_provider_env.get(key) == value, 'Unapproved provider credentials/configuration present')
    if env.get('GOTRUE_EXTERNAL_DISCORD_ENABLED') == 'true':
        require(env.get('GOTRUE_EXTERNAL_DISCORD_URL') == 'http://host.docker.internal:59400', 'Discord OAuth is not the isolated mock')
        require(env.get('GOTRUE_EXTERNAL_DISCORD_CLIENT_ID') == 'synthetic-client', 'Unexpected OAuth client')
        require(env.get('GOTRUE_EXTERNAL_DISCORD_SECRET') == 'synthetic-secret', 'Unexpected OAuth secret')
for name in ['migrations', 'functions']:
    target = ROOT / 'supabase' / name
    require(target.resolve() == target and target.stat().st_uid == os.getuid(), 'Untrusted target subtree')
    shutil.rmtree(target)
    shutil.copytree(SOURCE / 'supabase' / name, target)
print('Verified disposable loopback database, project labels, and absence of live provider configuration (exact synthetic mock allowlist).', flush=True)
EVIDENCE.mkdir(mode=0o700, exist_ok=True)
require(EVIDENCE.resolve() == EVIDENCE and EVIDENCE.stat().st_uid == os.getuid(), 'Untrusted evidence directory')
os.chmod(EVIDENCE, 0o700)
fd = os.open(EVIDENCE / 'replay-current.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as output:
    subprocess.run([str(SOURCE / 'node_modules/.bin/supabase'), 'db', 'reset', '--local', '--workdir', str(ROOT), '--no-seed', *(['--version', '20260912085904'] if options.through_ac else [])], stdout=output, stderr=subprocess.STDOUT, check=True)
print('Disposable fresh replay passed.', flush=True)
