import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyPaths, fullJobs } from '../ci/validation-plan.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
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
  assert.match(classify, /if \[ "\$EVENT_NAME" != "pull_request" \]; then args\+=\(--full\); fi/);
  assert.match(ci, /args\+=\(--full\)/);
  assert.match(ci, /vitest run --coverage --shard=/);
  assert.match(ci, /deno test supabase\/functions\/_shared\/\*\.deno\.test\.ts/);
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
  assert.match(lintStep, /"\$RUNNER_TEMP\/actionlint" -color/);
  assert.match(lintStep, /"\$RUNNER_TEMP\/zizmor" --no-progress --min-severity low \.github\//);
  assert.doesNotMatch(lintStep, /pipx|pip install|npx /);
  assert.match(read('scripts/ci/validate-changes.mjs'), /workflows=\$\{plan.workflows\}/);
});
test('Dependabot auto-merge requires immutable author and event actor identities', () => {
  const workflow = read('.github/workflows/dependabot-auto-merge.yml');
  const job = jobBlock(workflow, 'auto-merge');
  const eligibility = job.slice(0, job.indexOf('    steps:'));
  assert.match(workflow, /workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/);
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
