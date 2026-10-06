import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  jobBlock,
  permissionsBlock,
  workflowEvent,
  workflowStep,
} from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
test('security audits need only the pinned runtime; scheduled outdated checks retain installation', () => {
  const setup = read('.github/actions/setup-project/action.yml');
  const steps = setup.replace(/^ {4}- /gm, '      - ');
  assert.match(setup, /install-dependencies:[\s\S]*?default: 'true'/);
  // Only an explicit false opts out; omitted or unknown input values keep full setup.
  const conditions = setup.match(/if: inputs.install-dependencies != 'false'/g) || [];
  assert.equal(conditions.length, 2);
  assert.match(
    setup,
    /uses: actions\/setup-node@[a-f0-9]{40}[^\n]*\n {6}if: inputs.install-dependencies != 'false'\n[\s\S]*?cache: pnpm/
  );
  assert.match(
    workflowStep(steps, 'Install dependencies'),
    /if: inputs.install-dependencies != 'false'/
  );
  assert.doesNotMatch(workflowStep(steps, 'Activate packageManager'), /if:/);
  assert.match(
    workflowStep(steps, 'Activate packageManager'),
    /bash scripts\/setup\/ensure-pnpm.sh/
  );
  const scan = jobBlock(read('.github/workflows/security.yml'), 'security-scan');
  assert.match(scan, /install-dependencies: \$\{\{ github.event_name == 'schedule' \}\}/);
  assert.match(
    workflowStep(scan, 'Check for outdated dependencies'),
    /if: github.event_name == 'schedule'/
  );
  const prepare = workflowStep(scan, 'Prepare pnpm audit workspace');
  assert.match(prepare, /cp pnpm-lock.yaml package.json "\$audit_dir\/"/);
  for (const name of ['Audit production dependencies', 'Audit all dependencies (informational)']) {
    const audit = workflowStep(scan, name);
    assert.match(audit, /working-directory: \$\{\{ steps.prepare-audit.outputs.audit_dir \}\}/);
    assert.doesNotMatch(audit, /^\s+if:/m);
  }
});
test('security is a reusable workflow with only the weekly schedule as a standalone trigger', () => {
  const security = read('.github/workflows/security.yml');
  workflowEvent(security, 'workflow_call');
  assert.match(workflowEvent(security, 'schedule'), /cron: '0 0 \* \* 0'/);
  assert.throws(() => workflowEvent(security, 'push'), /missing/);
  assert.throws(() => workflowEvent(security, 'pull_request'), /missing/);
  const scan = jobBlock(security, 'security-scan');
  assert.match(
    workflowStep(scan, 'Audit production dependencies'),
    /run: node "\$GITHUB_WORKSPACE\/scripts\/checks\/audit-dependencies\.mjs"$/m
  );
  const informational = workflowStep(scan, 'Audit all dependencies (informational)');
  assert.match(informational, /::notice title=Informational dependency audit::/);
  assert.doesNotMatch(informational, /exit 1/);
  assert.match(workflowStep(scan, 'Fail on Gitleaks findings'), /exit 1/);
  assert.match(workflowStep(scan, 'Install Gitleaks CLI'), /sha256sum --check --strict/);
  const canary = workflowStep(scan, 'Verify Gitleaks detects a canary secret');
  assert.match(canary, /"role":"service_role"/);
  assert.match(
    canary,
    /gitleaks dir "\$canary_dir" --config \.github\/\.gitleaks\.toml --exit-code 42 .*\|\| status=\$\?/
  );
  assert.match(canary, /if \[ "\$status" -ne 42 \]; then/);
  assert.ok(
    scan.indexOf('Verify Gitleaks detects a canary secret') < scan.indexOf('- name: Gitleaks scan'),
    'canary check runs before the repository scan'
  );
  const codeql = jobBlock(security, 'codeql');
  assert.match(permissionsBlock(codeql, '    '), /^ {6}security-events: write$/m);
  assert.match(codeql, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
  assert.doesNotMatch(codeql, /continue-on-error/);
});
test('CI calls the security workflow for every event and gates CI Result on it', () => {
  const ci = read('.github/workflows/ci.yml');
  const security = jobBlock(ci, 'security');
  assert.match(security, /^ {4}uses: \.\/\.github\/workflows\/security\.yml$/m);
  // No `if:`/`needs:` gate: pull requests, main pushes and explicit dispatches all run it.
  assert.doesNotMatch(security, /^ {4}if:/m);
  assert.doesNotMatch(security, /^ {4}needs:/m);
  const permissions = permissionsBlock(security, '    ');
  assert.match(permissions, /^ {6}security-events: write$/m);
  assert.match(permissions, /^ {6}actions: read$/m);
  assert.match(permissions, /^ {6}contents: read$/m);
  const result = jobBlock(ci, 'ci-result');
  const needs = result.slice(result.indexOf('needs:'), result.indexOf('runs-on:'));
  assert.match(needs, /\bsecurity,?\s/);
  // Ordinary wip/** push CI is gone: staging branches receive CI only through explicit dispatch.
  assert.match(workflowEvent(ci, 'push'), /^ {4}branches: \[main\]$/m);
  workflowEvent(ci, 'workflow_dispatch');
  assert.match(workflowEvent(ci, 'pull_request'), /branches: \[main\]/);
});
test('Gitleaks extends the default rules and allowlists only the exact public anon JWT', () => {
  const config = read('.github/.gitleaks.toml');
  const extend = config.slice(config.indexOf('[extend]'), config.indexOf('[['));
  assert.match(extend, /^useDefault = true$/m);
  const jwt = config.split('[[allowlists]]').find((block) => /targetRules = \["jwt"\]/.test(block));
  assert.ok(jwt, 'missing jwt allowlist');
  assert.match(jwt, /^condition = "AND"$/m);
  assert.match(jwt, /^regexTarget = "secret"$/m);
  const anonKey = read('wrangler.toml').match(/SUPABASE_ANON_KEY = "(eyJ[^"]+)"/)?.[1];
  assert.ok(anonKey, 'missing public anon key in wrangler.toml');
  assert.equal(JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url')).role, 'anon');
  assert.ok(
    jwt.includes(`'''^${anonKey.replaceAll('.', '\\.')}$'''`),
    'allowlist must pin the anon key'
  );
});
