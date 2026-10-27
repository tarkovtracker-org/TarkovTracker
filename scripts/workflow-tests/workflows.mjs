import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { classifyPaths, fullJobs } from '../ci/validation-plan.mjs';
import { fixture } from './helpers/automation-fixture.mjs';
import { jobBlock, workflowEvent, workflowStep } from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
test('Dependabot waits only for the authoritative aggregates supplied by repository workflows', () => {
  const gate = read('.github/workflows/dependabot-auto-merge.yml');
  const wait = workflowStep(jobBlock(gate, 'auto-merge'), 'Wait for checks');
  const expected = [...wait.match(/expected_checks=\(([\s\S]*?)\)/)[1].matchAll(/"([^"]+)"/g)].map(
    (match) => match[1]
  );
  const statuses = [
    ...wait.match(/expected_statuses=\(([\s\S]*?)\)/)[1].matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(expected, [
    'CI Result|15368',
    'PR Meta|15368',
    'Socket Security: Pull Request Alerts|156372',
  ]);
  assert.deepEqual(statuses, ['Preview Result']);
  // Individual CI and security job names are no longer a dependency of the merge gate.
  for (const name of ['Security Scan', 'CodeQL', 'Type Check', 'Validate', 'Fallow audit'])
    assert.ok(!expected.includes(name), name);
  const workflows = ['ci', 'pr-checks'].map((name) => read(`.github/workflows/${name}.yml`));
  for (const name of expected
    .filter((entry) => entry.endsWith('|15368'))
    .map((e) => e.split('|')[0]))
    assert.ok(
      workflows.some((w) => w.includes(`name: ${name}\n`)),
      name
    );
  assert.match(read('scripts/preview/profile.mjs'), /STATUS_CONTEXT = 'Preview Result'/);
  // Check runs must come from GitHub Actions; a foreign app cannot satisfy the aggregate name.
  assert.match(wait, /select\(\.name == \$name and \.app\.id == \$app\)/);
  assert.match(wait, /--argjson app "\$check_app"/);
  assert.match(wait, /failing_status_count.*-gt 0/);
  for (const job of [
    'Refresh preview state',
    'Plan preview',
    'Deploy preview',
    'Preview smoke tests',
    'Publish preview result',
  ])
    assert.ok(wait.includes(`.name != "${job}"`));
  assert.match(gate, /^ {2}actions: write$/m);
  assert.match(wait, /preview_requested=false/);
  assert.match(wait, /commits\/\$HEAD_SHA\/status/);
  assert.doesNotMatch(wait, /merge_commit_sha|merge_sha/);
  assert.match(wait, /select\(\.context == "Preview Result"\)/);
  assert.match(wait, /preview_status_contexts/);
  assert.match(wait, /gh workflow run preview\.yml.*--ref main -f "run_id=\$bound_run_id"/);
  assert.match(wait, /\.path == "\.github\/workflows\/ci\.yml"/);
  assert.match(wait, /deadline=\$\(\(SECONDS \+ 3600\)\)/);
  assert.match(jobBlock(gate, 'auto-merge'), /timeout-minutes: 90/);
  assert.match(read('.github/codecov.yml'), /absolute-floor:/);
});
const autoMergeJob = () =>
  jobBlock(read('.github/workflows/dependabot-auto-merge.yml'), 'auto-merge');
const npmGroups = (config) =>
  [
    ...config
      .slice(
        config.indexOf('package-ecosystem: npm'),
        config.indexOf('package-ecosystem: github-actions')
      )
      .matchAll(/^ {6}([a-z-]+):\n {8}(?:patterns|dependency-type)/gm),
  ].map((m) => m[1]);
test('Dependabot auto-merge covers every npm group except auth and billing', () => {
  const config = read('.github/dependabot.yml');
  const eligible = autoMergeJob();
  assert.match(eligible, /dependabot\/npm_and_yarn\/auth-and-billing-\*\)\n\s*;;/);
  assert.match(
    config,
    /auth-and-billing:\n {8}patterns:\n {10}- stripe\n {10}- '@stripe\/\*'\n {10}- '@supabase\/\*'\n {10}- supabase/
  );
  const groups = npmGroups(config).filter((group) => group !== 'auth-and-billing');
  assert.ok(groups.length >= 8, groups.join());
  for (const group of groups)
    assert.ok(eligible.includes(`dependabot/npm_and_yarn/${group}-*`), group);
});
test('Dependabot ignores direct dependencies that a pnpm override pins', () => {
  const pkg = JSON.parse(read('package.json'));
  const direct = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const workspace = read('pnpm-workspace.yaml');
  const overrides = workspace.slice(workspace.indexOf('\noverrides:\n') + 12).split(/\n\S/)[0];
  const pinned = [...overrides.matchAll(/^ {2}'?([^:'\n]+?)'?:/gm)]
    .map((m) => m[1])
    .filter((key) => !key.includes('>'))
    .map((key) => key.replace(/(?<=.)@[^@]*$/, ''))
    .filter((name) => direct.has(name));
  assert.ok(pinned.length > 0);
  const config = read('.github/dependabot.yml');
  const npm = config.slice(0, config.indexOf('package-ecosystem: github-actions'));
  const ignore = npm.slice(npm.indexOf('    ignore:\n'), npm.indexOf('    groups:\n'));
  const unconditional = new Set(
    ignore
      .split('\n      - ')
      .slice(1)
      .map((entry) =>
        entry.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'))
      )
      .filter((lines) => lines.length === 1)
      .map((lines) => lines[0].replace(/^dependency-name: /, '').replace(/^'(.*)'$/, '$1'))
  );
  for (const name of pinned) assert.ok(unconditional.has(name), name);
});
test('Dependabot auto-merge holds manifest changes to auth and billing clients', () => {
  const sensitive = autoMergeJob().match(/grep -E '([^']+)'/)[1];
  const grep = (line) => spawnSync('grep', ['-E', sensitive], { input: `${line}\n` }).status === 0;
  const held = [
    '+    "stripe": "^1.0.0",',
    '-\t"@supabase/supabase-js": "2.0.0",',
    '+  "supabase": "2.1.0"',
  ];
  for (const line of held) assert.ok(grep(line), line);
  for (const line of ['+    "stripe-mock": "1.0.0",', ' "stripe": "^1.0.0",'])
    assert.ok(!grep(line), line);
});
test('Dependabot auto-merge holds the PR when manifest changes cannot be read', () => {
  const job = autoMergeJob();
  const start = job.indexOf('# Defense in depth');
  const end = job.indexOf('echo "eligible=true"', start);
  const hold = job
    .slice(start, end + 'echo "eligible=true" >> "$GITHUB_OUTPUT"'.length)
    .replace(/^ {10}/gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'hold-'));
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "%s" "$GH_OUT"\nexit "$GH_STATUS"\n', {
    mode: 0o755,
  });
  const verdict = (out, status = 0) => {
    const output = join(dir, `out-${Math.random()}`);
    writeFileSync(output, '');
    spawnSync('bash', ['-e', '-o', 'pipefail', '-c', hold], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GH_OUT: out,
        GH_STATUS: String(status),
      },
    });
    return readFileSync(output, 'utf8').trim();
  };
  assert.equal(verdict('+  "vue": "3.5.0",'), 'eligible=true');
  assert.equal(verdict('+  "stripe": "1.0.0",'), 'eligible=false');
  assert.equal(verdict('MISSING_PATCH'), 'eligible=false');
  assert.equal(verdict('', 1), 'eligible=false');
});
test('path selection applies to pull requests only; pushes, forks and Deno checks stay covered', () => {
  const ci = read('.github/workflows/ci.yml');
  const classify = workflowStep(jobBlock(ci, 'changes'), 'Classify changes');
  // Shadow mode ended once the rollout evidence in docs/workflow-automation.md was captured.
  assert.doesNotMatch(classify, /--shadow/);
  assert.match(classify, /elif \[ "\$EVENT_NAME" != "pull_request" \]; then\n\s+args\+=\(--full\)/);
  assert.match(ci, /args\+=\(--full\)/);
  assert.match(ci, /vitest run --coverage --shard=/);
  assert.match(ci, /run: pnpm run test:deno$/m);
  assert.match(ci, /github.event.pull_request.head.repo.fork != true/);
  // Coverage and bundle uploads need the org token, so they stay fork-gated.
  // The build needs no secrets and must run on fork pull requests.
  // Scope both to the owning job and step: YAML step keys are unordered, so a
  // whole-file regex would still pass if `if:` were reintroduced after `run:`.
  const buildStep = workflowStep(jobBlock(ci, 'validate'), 'Build');
  assert.match(buildStep, /run: pnpm run build/);
  assert.doesNotMatch(buildStep, /^[ \t]+if:/m);
  assert.match(
    workflowStep(jobBlock(ci, 'test'), 'Upload coverage to Codecov'),
    /if:[^\n]*fork != true/
  );
  assert.match(ci, /ci-result:[\s\S]*if: always\(\)/);
  for (const name of ['ci', 'pr-checks', 'security', 'preview'])
    assert.ok(!read(`.github/workflows/${name}.yml`).includes('paths-ignore:'));
});
test('metrics rejects an explicitly empty follow-up boundary before contacting GitHub', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/workflow-metrics.mjs', '--after', ''], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid metrics options/);
});
test('metrics rejects inverted and empty date ranges before contacting GitHub', () => {
  for (const before of ['2026-09-01', '2026-09-02']) {
    const result = spawnSync(
      process.execPath,
      ['scripts/ci/workflow-metrics.mjs', '--after', '2026-09-02', '--before', before],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: '' },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /after must precede before/);
  }
});
test('empty classifier output produces the missing-plan diagnostic and fails CI', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/check-ci-result.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, VALIDATION_PLAN: '', CI_NEEDS: '{}' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing or invalid validation plan/);
});
test('workflow linting is selected only for automation changes and fails closed without paths', () => {
  for (const paths of [
    ['.github/workflows/ci.yml'],
    ['.github/zizmor.yml'],
    ['.github/actions/setup-project/action.yml'],
    [],
  ])
    assert.equal(classifyPaths(paths).workflows, true, paths.join());
  for (const paths of [
    ['README.md'],
    ['.github/workflows/README.md'],
    ['app/a.ts'],
    ['../.github/x.yml'],
  ])
    assert.equal(classifyPaths(paths).workflows, false, paths.join());
  const ci = read('.github/workflows/ci.yml');
  // The classifier output must reach the job output, or the lint step silently never runs.
  assert.match(jobBlock(ci, 'changes'), /workflows: \$\{\{ steps\.plan\.outputs\.workflows \}\}/);
  const lintStep = workflowStep(jobBlock(ci, 'lint-format'), 'Lint GitHub Actions workflows');
  assert.match(lintStep, /if: needs.changes.outputs.workflows == 'true'/);
  assert.match(lintStep, /curl --proto '=https' --proto-redir '=https'/);
  assert.match(lintStep, /sha256sum --check --strict/);
  // Both linters are pinned release binaries verified against a recorded checksum; neither
  // executes an unverified package manager download while the token is in the environment.
  assert.match(lintStep, /ACTIONLINT_VERSION: \d+\.\d+\.\d+\n/);
  assert.match(lintStep, /ACTIONLINT_SHA256: [0-9a-f]{64}\n/);
  assert.match(lintStep, /"\$ACTIONLINT_SHA256"/);
  assert.match(lintStep, /ZIZMOR_VERSION: \d+\.\d+\.\d+\n/);
  assert.match(lintStep, /ZIZMOR_SHA256: [0-9a-f]{64}\n/);
  assert.match(lintStep, /"\$ZIZMOR_SHA256"/);
  assert.match(lintStep, /node scripts\/ci\/actionlint-queue\.mjs "\$RUNNER_TEMP\/actionlint"/);
  assert.match(
    read('scripts/ci/actionlint-queue.mjs'),
    /'-color', '-stdin-filename', filename, '-'/
  );
  assert.match(lintStep, /"\$RUNNER_TEMP\/zizmor" --no-progress --min-severity low \.github\//);
  assert.doesNotMatch(lintStep, /pipx|pip install|npx /);
  assert.match(read('scripts/ci/validate-changes.mjs'), /workflows=\$\{plan.workflows\}/);
});
test('Dependabot auto-merge requires immutable author and event actor identities', () => {
  const workflow = read('.github/workflows/dependabot-auto-merge.yml');
  const job = jobBlock(workflow, 'auto-merge');
  const eligibility = job.slice(0, job.indexOf('    steps:'));
  assert.match(workflow, /workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/);
  assert.match(workflowEvent(workflow, 'workflow_run'), /^ {4}branches: \['dependabot\/\*\*'\]$/m);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(eligibility, /workflow_run\.(actor|triggering_actor)\.id/);
  assert.doesNotMatch(eligibility, /workflow_run\.head_repository/);
  const gate = workflowStep(job, 'Gate Dependabot PR');
  assert.match(gate, /\.actor\.id == 49699333 and \.triggering_actor\.id == 49699333/);
  assert.match(gate, /\.head_repository\.full_name == \$repo/);
  assert.match(gate, /\.user\.id == 49699333/);
  assert.doesNotMatch(eligibility, /github\.actor\s*==|user\.login\s*==/);
});
test('CI job-level full gates match the classifier manifest', () => {
  const jobs = [
    ...read('.github/workflows/ci.yml').matchAll(
      /^ {2}([a-z-]+):\n([\s\S]*?)(?=^ {2}[a-z-]+:|$(?![\s\S]))/gm
    ),
  ];
  const gated = jobs
    .filter((match) => /^ {4}if: needs.changes.outputs.full == 'true'$/m.test(match[2]))
    .map((match) => match[1]);
  const reduced = classifyPaths(['README.md']).jobs;
  const alphabetical = (left, right) => left.localeCompare(right);
  // `validate` is gated on full OR preview so translation-only pull requests still build.
  const expected = fullJobs
    .filter((job) => !reduced.includes(job) && job !== 'validate')
    .toSorted(alphabetical);
  assert.deepEqual(gated.toSorted(alphabetical), expected);
  const validate = jobs.find((match) => match[1] === 'validate')[2];
  assert.match(
    validate,
    /^ {4}if: needs.changes.outputs.full == 'true' \|\| needs.changes.outputs.preview == 'true'$/m
  );
  assert.match(
    jobBlock(read('.github/workflows/ci.yml'), 'changes'),
    /preview: \$\{\{ steps\.plan\.outputs\.preview \}\}/
  );
  assert.match(read('scripts/ci/validate-changes.mjs'), /preview=\$\{plan.previewRequired\}/);
  for (const job of fullJobs)
    assert.ok(
      jobs.some((match) => match[1] === job),
      job
    );
});
test('Deno resolves the functions config and fails on lockfile drift', () => {
  const script = JSON.parse(read('package.json')).scripts['test:deno'];
  assert.match(script, /^deno test --config supabase\/functions\/deno\.json --frozen /);
  for (const file of ['.github/workflows/ci.yml', 'scripts/ci/validate-changes.mjs'])
    assert.doesNotMatch(read(file), /\bdeno test\b/, file);
  assert.match(read('.gitignore'), /^\/deno\.lock$/m);
});
function dependabotScript(name) {
  const step = workflowStep(autoMergeJob(), name);
  return step
    .split('run: |\n')[1]
    .replaceAll(/^ {10}/gm, '')
    .replaceAll(
      'source scripts/ci/github-ci-gate.sh',
      `source '${resolve('scripts/ci/github-ci-gate.sh')}'`
    );
}
const dependabotMergeScript = () => dependabotScript('Merge Dependabot PR');
function dependabotChecks(state) {
  return {
    WAIT_CHECK_RUNS: JSON.stringify([
      { name: 'CI Result', app: { id: 15368 }, status: 'completed', conclusion: 'success' },
      { name: 'PR Meta', app: { id: 15368 }, status: 'completed', conclusion: 'success' },
      {
        name: 'Review admission controller',
        app: { id: 15368 },
        status: 'completed',
        conclusion: 'failure',
      },
      {
        name: 'Filter admission event',
        app: { id: 15368 },
        status: 'in_progress',
        conclusion: null,
      },
      {
        name: 'Socket Security: Pull Request Alerts',
        app: { id: 156372 },
        status: 'completed',
        conclusion: 'success',
      },
    ]),
    WAIT_STATUSES: JSON.stringify([
      { id: 1, context: 'Preview Result', state: 'success' },
      ...(state === undefined ? [] : [{ id: 2, context: 'Review Admission', state }]),
    ]),
  };
}
test('Dependabot recovers stale admission before checking GitHub mergeability', (t) => {
  for (const state of ['failure', 'pending', undefined]) {
    const f = fixture(t);
    const result = f.shell(
      'set -e\n(' + dependabotScript('Wait for checks') + ')\n(' + dependabotMergeScript() + ')',
      {
        ...dependabotChecks(state),
        RULES: JSON.stringify(activeQueueRules()),
        CHECKED_MERGE_MODE: 'queue',
        BLOCKED_UNTIL_ADMISSION: 'true',
        MERGE_OUTCOME: 'OPEN',
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(f.output(), /merge_mode=queue/);
    assert.ok(f.events().some((event) => event.type === 'admission-success'));
    assert.ok(f.events().some((event) => event.type === 'merge'));
    assert.ok(!f.events().some((event) => event.type === 'dispatch'));
  }
});
test('Dependabot never submits a candidate when refreshed admission fails', (t) => {
  const f = fixture(t);
  const result = f.shell(dependabotMergeScript(), {
    RULES: JSON.stringify(activeQueueRules()),
    CHECKED_MERGE_MODE: 'queue',
    BLOCKED_UNTIL_ADMISSION: 'true',
    ADMISSION_FAIL: 'true',
  });
  assert.equal(result.status, 1);
  assert.ok(f.events().some((event) => event.type === 'admission'));
  assert.ok(!f.events().some((event) => event.type === 'merge' || event.type === 'dispatch'));
});
test('Dependabot retries if policy mode changed since the checks step', (t) => {
  const merge = workflowStep(autoMergeJob(), 'Merge Dependabot PR');
  assert.match(merge, /CHECKED_MERGE_MODE: \$\{\{ steps\.checks\.outputs\.merge_mode \}\}/);
  for (const checked of ['strict', 'strict-queue', '']) {
    const f = fixture(t);
    const result = f.shell(dependabotMergeScript(), {
      RULES: JSON.stringify(activeQueueRules()),
      CHECKED_MERGE_MODE: checked,
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Main merge policy changed since Dependabot checks/);
    assert.ok(!f.events().some((event) => event.type === 'admission' || event.type === 'merge'));
  }
  const f = fixture(t);
  const rollback = f.shell(dependabotMergeScript(), { CHECKED_MERGE_MODE: 'queue' });
  assert.equal(rollback.status, 1);
  assert.ok(!f.events().some((event) => event.type === 'admission' || event.type === 'merge'));
});
test('Dependabot retains strict admission failures and unrelated queue status failures', (t) => {
  const strict = fixture(t);
  const denied = strict.shell(dependabotScript('Wait for checks'), dependabotChecks('failure'));
  assert.equal(denied.status, 1);
  assert.match(denied.stdout, /Review Admission concluded failure/);
  const queue = fixture(t);
  const checks = dependabotChecks('failure');
  const statuses = JSON.parse(checks.WAIT_STATUSES);
  statuses.push({ id: 3, context: 'Other security gate', state: 'failure' });
  const blocked = queue.shell(dependabotScript('Wait for checks'), {
    ...checks,
    RULES: JSON.stringify(activeQueueRules()),
    WAIT_STATUSES: JSON.stringify(statuses),
  });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /Other security gate concluded failure/);
  assert.ok(!queue.events().some((event) => event.type === 'admission' || event.type === 'merge'));
});
test('Dependabot retains unrelated and foreign admission-named check failures', (t) => {
  for (const check of [
    { name: 'Other security check', app: { id: 15368 } },
    { name: 'Review admission controller', app: { id: 44 } },
  ]) {
    const f = fixture(t);
    const gates = dependabotChecks('failure');
    const checks = JSON.parse(gates.WAIT_CHECK_RUNS);
    checks.push({ ...check, status: 'completed', conclusion: 'failure' });
    const result = f.shell(dependabotScript('Wait for checks'), {
      ...gates,
      RULES: JSON.stringify(activeQueueRules()),
      WAIT_CHECK_RUNS: JSON.stringify(checks),
    });
    assert.equal(result.status, 1);
    assert.ok(!f.events().some((event) => event.type === 'admission' || event.type === 'merge'));
  }
});
function activeQueueRules() {
  return JSON.parse(read('.github/main-merge-queue-ruleset.json')).rules.map((rule) => ({
    ...rule,
    ...(rule.type === 'required_status_checks'
      ? {
          parameters: {
            ...rule.parameters,
            required_status_checks: rule.parameters.required_status_checks.map((check) =>
              check.context === 'Review Admission' ? { ...check, integration_id: 987654 } : check
            ),
          },
        }
      : {}),
    ruleset_source_type: 'Repository',
    ruleset_source: 'example/repo',
    ruleset_id: 43,
  }));
}
test('Dependabot queue submission preserves behind head and never dispatches main CI early', (t) => {
  const f = fixture(t);
  const result = f.shell(dependabotMergeScript(), {
    MAIN_MERGE_MODE: 'queue',
    CHECKED_MERGE_MODE: 'queue',
    RULES: JSON.stringify(activeQueueRules()),
    PR_STATES: JSON.stringify([{ ...f.pr, mergeStateStatus: 'BEHIND' }]),
    MERGE_OUTCOME: 'OPEN',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Submitted reviewed Dependabot PR/);
  assert.ok(f.events().some((event) => event.type === 'admission' && event.runId === '777'));
  assert.ok(!f.events().some((event) => event.type === 'dispatch'));
  const enqueue = f.events().find((event) => event.type === 'enqueue');
  assert.equal(enqueue.input.expectedHeadOid, f.head);
  assert.ok(!f.calls().some((args) => args[0] === 'pr' && args[1] === 'merge'));
});
test('Dependabot native enqueue works when repository auto-merge is disabled', (t) => {
  const f = fixture(t);
  const options = {
    RULES: JSON.stringify(activeQueueRules()),
    CHECKED_MERGE_MODE: 'queue',
    AUTO_MERGE_DISABLED: 'true',
    MERGE_OUTCOME: 'OPEN',
    PR_STATES: JSON.stringify([{ ...f.pr, mergeStateStatus: 'UNSTABLE' }]),
  };
  const result = f.shell(dependabotMergeScript(), options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.events().filter((event) => event.type === 'enqueue').length, 1);
  const cliMutant = dependabotMergeScript().replace(
    'enqueue_reviewed_pr "$PR_NUMBER" "$HEAD_SHA"',
    'gh pr merge "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --match-head-commit "$HEAD_SHA" --squash'
  );
  assert.notEqual(cliMutant, dependabotMergeScript());
  const denied = f.shell(cliMutant, options);
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /Auto merge is not allowed/);
});
test('Dependabot dispatches main CI only after actual merge and holds failed admission', (t) => {
  const f = fixture(t);
  const queue = {
    MAIN_MERGE_MODE: 'queue',
    CHECKED_MERGE_MODE: 'queue',
    RULES: JSON.stringify(activeQueueRules()),
  };
  const denied = f.shell(dependabotMergeScript(), { ...queue, ADMISSION_FAIL: 'true' });
  assert.equal(denied.status, 1);
  assert.ok(!f.events().some((event) => event.type === 'merge' || event.type === 'dispatch'));
  const merged = f.shell(dependabotMergeScript(), { ...queue, MERGE_OUTCOME: 'MERGED' });
  assert.equal(merged.status, 0, merged.stderr);
  assert.ok(f.events().some((event) => event.type === 'dispatch' && event.ref === 'main'));
});
test('Dependabot rollout coexistence retains freshness and admission while reporting native queue submission', (t) => {
  const f = fixture(t);
  const rules = activeQueueRules();
  rules.push({
    ...rules[0],
    ruleset_id: 42,
    parameters: { ...rules[0].parameters, strict_required_status_checks_policy: true },
  });
  const rollout = {
    RULES: JSON.stringify(rules),
    CHECKED_MERGE_MODE: 'strict-queue',
    MERGE_OUTCOME: 'OPEN',
  };
  const queued = f.shell(dependabotMergeScript(), rollout);
  assert.equal(queued.status, 0, queued.stderr);
  assert.ok(f.events().some((event) => event.type === 'admission'));
  assert.ok(!f.events().some((event) => event.type === 'dispatch'));
  const before = f.events().length;
  const behind = f.shell(dependabotMergeScript(), {
    ...rollout,
    PR_STATES: JSON.stringify([{ ...f.pr, mergeStateStatus: 'BEHIND' }]),
  });
  assert.equal(behind.status, 1);
  assert.match(behind.stdout + behind.stderr, /Behind PR requires strict freshness/);
  assert.ok(
    !f
      .events()
      .slice(before)
      .some((event) => event.type === 'admission' || event.type === 'merge')
  );
});
test('automation shell keeps fixture commands ahead of host startup tooling', (t) => {
  const f = fixture(t);
  const result = f.shell(
    'node /fixture/review-admission-cli.mjs "$GITHUB_REPOSITORY" "$HEAD_SHA" "$PR_NUMBER" 777',
    { SHLVL: '0' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(f.events().some((event) => event.type === 'admission' && event.runId === '777'));
  const harness = read('scripts/workflow-tests/helpers/automation-fixture.mjs');
  assert.match(harness, /\['--noprofile', '--norc', '-c', script\]/);
});
test('repository-controlled workflow normalization receives no online-audit token', (t) => {
  const workflow = read('.github/workflows/ci.yml');
  const step = workflowStep(jobBlock(workflow, 'lint-format'), 'Lint GitHub Actions workflows');
  assert.match(step, /GH_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(step, /"\$RUNNER_TEMP\/zizmor" --no-progress/);
  const command = step
    .match(/^ +(?:env -u GH_TOKEN )?node scripts\/ci\/actionlint-queue\.mjs[^\n]*$/m)[0]
    .trim();
  const dir = mkdtempSync(join(tmpdir(), 'workflow-token-scope-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, 'node'),
    '#!/bin/sh\n[ -z "${GH_TOKEN+x}" ] || exit 9\nprintf "token-absent\\n"\n',
    { mode: 0o755 }
  );
  const env = {
    PATH: `${dir}:${process.env.PATH}`,
    GH_TOKEN: 'synthetic-audit-token',
    RUNNER_TEMP: dir,
  };
  const run = (script) =>
    spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], { env, encoding: 'utf8' });
  assert.equal(run(command).status, 0);
  assert.equal(run(command).stdout.trim(), 'token-absent');
  assert.equal(run(command.replace('env -u GH_TOKEN ', '')).status, 9);
});
test('Supabase DB pulls images from Docker Hub instead of the rate-limited CLI fallback chain', () => {
  const job = jobBlock(read('.github/workflows/ci.yml'), 'supabase-db');
  assert.match(job, /^ {6}SUPABASE_INTERNAL_IMAGE_REGISTRY: docker\.io$/m);
  assert.doesNotMatch(job, /docker login|secrets\./);
});
test('Dependabot gate judges only the latest run of each check, not superseded cancellations', () => {
  const wait = workflowStep(
    jobBlock(read('.github/workflows/dependabot-auto-merge.yml'), 'auto-merge'),
    'Wait for checks'
  );
  assert.match(wait, /gh api --paginate --slurp \\\n/, 'every check-run page is evaluated');
  // Compose the strict-mode filter exactly as the step does and run it against real jq.
  const base = /check_filter='([^']+)'/.exec(wait)[1];
  const dedupe = /check_filter\+=' (\| group_by[^']+)'/.exec(wait)[1];
  const run = (id, name, app, conclusion) => ({
    id,
    name,
    app: { id: app },
    status: 'completed',
    conclusion,
  });
  const pages = [
    { check_runs: [run(1, 'PR Title', 15368, 'cancelled'), run(3, 'CI Result', 15368, 'failure')] },
    { check_runs: [run(2, 'PR Title', 15368, 'success'), run(4, 'CI Result', 999, 'success')] },
  ];
  const jq = spawnSync('jq', ['-c', `{check_runs: [.[].check_runs[]]} | ${base} ${dedupe}`], {
    input: JSON.stringify(pages),
    encoding: 'utf8',
  });
  assert.equal(jq.status, 0, jq.stderr);
  const latest = Object.fromEntries(
    JSON.parse(jq.stdout).map((check) => [`${check.name}|${check.app.id}`, check.conclusion])
  );
  assert.deepEqual(latest, {
    'PR Title|15368': 'success',
    'CI Result|15368': 'failure',
    'CI Result|999': 'success',
  });
});
