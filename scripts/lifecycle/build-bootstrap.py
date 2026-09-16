"""Build an isolated A+C-compatible control bootstrap. Never deploys or reads env files."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

BASELINE = '08e34653dc9867dcf716c4845cde0cffcf8b88a6'
ROOT = Path(__file__).resolve().parents[2]
TARGET = Path(sys.argv[1]).resolve()
if TARGET.exists():
    raise SystemExit('Choose a new empty output directory')
TARGET.mkdir(mode=0o700, parents=True)
def original(path):
    return subprocess.check_output(['git', 'show', f'{BASELINE}:{path}'], cwd=ROOT)
def write(path, data):
    destination = TARGET / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASELINE, 'supabase'], cwd=ROOT, text=True).splitlines()
for path in paths:
    if path.startswith('supabase/migrations/') or path in ('supabase/functions/deno.json', 'supabase/functions/import_map.json'):
        write(path, original(path))
for name in ('account-delete', 'account-delete-reconcile'):
    source = "import { deletionMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(deletionMaintenance);\n"
    write(f'supabase/functions/{name}/index.ts', source.encode())
write('supabase/functions/stripe-webhook/index.ts', b"import { stripeMaintenance } from '../_shared/lifecycle-maintenance.ts';\nDeno.serve(stripeMaintenance(Deno.env.get('STRIPE_WEBHOOK_SECRET')));\n")
for name in ('lifecycle-maintenance.ts', 'stripe-signature.ts'):
    path = 'supabase/functions/_shared/' + name
    write(path, (ROOT / path).read_bytes())
for name in ('20260912190000_billing_initiation_bootstrap.sql', '20260914092616_lifecycle_unlink_bootstrap.sql'):
    bootstrap = 'supabase/migrations/' + name
    write(bootstrap, (ROOT / bootstrap).read_bytes())
write('supabase/config.toml', b'project_id = "tt-b-control-bootstrap"\n[functions.account-delete]\nverify_jwt = false\n[functions.account-delete-reconcile]\nverify_jwt = false\n[functions.stripe-webhook]\nverify_jwt = false\n')
manifest = {str(p.relative_to(TARGET)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(TARGET.rglob('*')) if p.is_file()}
write('bootstrap-manifest.json', (json.dumps({'baseline': BASELINE, 'files': manifest}, indent=2) + '\n').encode())
print('B0 built: three retry-only entrypoints, unlink capture and billing reservations; no deployment')
