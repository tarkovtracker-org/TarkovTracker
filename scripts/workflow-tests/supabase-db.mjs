import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const validations = [
  'exec supabase db reset --no-seed',
  'exec supabase test db supabase/tests/database',
  'run supabase:test:task-identity-concurrency',
  'run supabase:test:concurrency',
  'run supabase:test:one-time-concurrency',
  'run supabase:test:owner-only-concurrency',
  'run supabase:test:deletion-billing-concurrency',
  'exec supabase db lint --schema public --fail-on error',
];
function assertDatabaseBoundary(workflow) {
  const step = workflowStep(jobBlock(workflow, 'supabase-db'), 'Validate Supabase migrations');
  assert.match(
    step,
    /^ {8}run: node scripts\/checks\/check-supabase-ci\.mjs$/m,
    'isolated Supabase CI entrypoint is required'
  );
}
test('the database job uses the isolated CI entrypoint and cannot skip validation', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assertDatabaseBoundary(workflow);
  const bypass = workflow.replace(
    'run: node scripts/checks/check-supabase-ci.mjs',
    'run: echo skipped'
  );
  assert.notEqual(bypass, workflow);
  assert.throws(() => assertDatabaseBoundary(bypass), /isolated Supabase CI entrypoint/);
});
function executable(path, source) {
  writeFileSync(path, `#!/usr/bin/env bash\n${source}\n`, { mode: 0o755 });
}
function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'supabase-bash-test-'));
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  const trace = join(directory, 'trace');
  const state = join(directory, 'state');
  const script = join(directory, 'check.sh');
  writeFileSync(
    script,
    readFileSync('scripts/checks/check-supabase-db.sh', 'utf8').replaceAll('\r\n', '\n')
  );
  executable(
    join(bin, 'pnpm'),
    `
printf '%s\\n' "$*" >> "$TRACE"
case "$*" in
  'exec supabase status') exit "$STATUS_EXIT" ;;
  'exec supabase db start')
    count=0
    if [[ -f "$STATE" ]]; then read -r count < "$STATE"; fi
    count=$((count + 1))
    printf '%s\\n' "$count" > "$STATE"
    if [[ "$count" -le "$START_FAILURES" ]]; then exit 1; fi
    ;;
esac
if [[ "$*" == "$FAIL_COMMAND" ]]; then exit 17; fi
exit 0`
  );
  executable(join(bin, 'node'), 'printf \'diagnostics\\n\' >> "$TRACE"; exit "$DIAGNOSTIC_EXIT"');
  executable(join(bin, 'sleep'), 'exit 0');
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    TRACE: trace.replaceAll('\\', '/'),
    STATE: state.replaceAll('\\', '/'),
    STATUS_EXIT: '1',
    START_FAILURES: '0',
    DIAGNOSTIC_EXIT: '0',
    FAIL_COMMAND: '',
    ...options,
  };
  try {
    const result = spawnSync(
      process.env.WORKFLOW_TEST_BASH ?? '/bin/bash',
      [script.replaceAll('\\', '/')],
      { cwd: directory, env, encoding: 'utf8' }
    );
    assert.equal(result.error, undefined, 'Bash must start before the fixture can prove anything');
    const commands = readFileSync(trace, 'utf8').trim().split(/\r?\n/);
    return { result, commands };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test('successful startup runs every database validation exactly once and cleans up its stack', () => {
  const { result, commands } = fixture();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(commands, [
    'exec supabase status',
    'exec supabase db start',
    ...validations,
    'exec supabase stop --no-backup',
  ]);
});
test('startup retry records ownership before cleanup and still runs all validations', () => {
  const { result, commands } = fixture({ START_FAILURES: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(commands, [
    'exec supabase status',
    'exec supabase db start',
    'diagnostics',
    'exec supabase stop --no-backup',
    'exec supabase db start',
    ...validations,
    'exec supabase stop --no-backup',
  ]);
});
test('persistent startup failure remains a failure even when diagnostics also fail', () => {
  const { result, commands } = fixture({ START_FAILURES: '2', DIAGNOSTIC_EXIT: '1' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(commands.filter((command) => command === 'diagnostics').length, 2);
  assert.equal(
    commands.filter((command) => command === 'exec supabase stop --no-backup').length,
    2
  );
  assert.equal(
    commands.some((command) => validations.includes(command)),
    false
  );
});
for (const failed of validations) {
  test(`database validation failure propagates and cleans up: ${failed}`, () => {
    const { result, commands } = fixture({ FAIL_COMMAND: failed });
    assert.equal(result.status, 17, result.stderr);
    assert.equal(commands.at(-1), 'exec supabase stop --no-backup');
    assert.deepEqual(
      commands.filter((command) => validations.includes(command)),
      validations.slice(0, validations.indexOf(failed) + 1)
    );
  });
}
test('a pre-existing developer stack retains its existing lifecycle behavior', () => {
  const { result, commands } = fixture({ STATUS_EXIT: '0' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(commands, ['exec supabase status', ...validations]);
});
