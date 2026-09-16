import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyPaths, fullJobs } from '../validation-plan.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
test('Dependabot expected check names remain supplied by repository workflows', () => {
  const gate = read('.github/workflows/dependabot-auto-merge.yml');
  const expected = [...gate.match(/expected_checks=\(([\s\S]*?)\)/)[1].matchAll(/"([^"]+)"/g)].map(
    (match) => match[1]
  );
  const workflows = ['ci', 'pr-checks', 'security']
    .map((name) => read(`.github/workflows/${name}.yml`))
    .join('\n');
  for (const name of expected) {
    if (/^Test \(shard [1-4]\/4\)$/.test(name)) {
      assert.match(workflows, /shard: \[1, 2, 3, 4\]/);
      assert.match(
        workflows,
        /name: Test \(shard \$\{\{ matrix.shard \}\}\/\$\{\{ matrix.total \}\}\)/
      );
    } else assert.ok(workflows.includes(`name: ${name}\n`), name);
  }
  assert.match(gate, /failing_status_count.*-gt 0/);
  assert.match(read('codecov.yml'), /absolute-floor:/);
});
test('path selection applies to pull requests only; pushes, forks and Deno checks stay covered', () => {
  const ci = read('.github/workflows/ci.yml');
  const classify = workflowStep(jobBlock(ci, 'changes'), 'Classify changes');
  // Shadow mode ended once the rollout evidence in docs/WORKFLOW_AUTOMATION.md was captured.
  assert.doesNotMatch(classify, /--shadow/);
  assert.match(classify, /if \[ "\$EVENT_NAME" != "pull_request" \]; then args\+=\(--full\); fi/);
  assert.match(ci, /args\+=\(--full\)/);
  assert.match(ci, /vitest run --coverage --shard=/);
  assert.match(ci, /deno test supabase\/functions\/_shared\/\*\.deno\.test\.ts/);
  assert.match(ci, /github.event.pull_request.head.repo.fork != true/);
  // Coverage and bundle uploads need the org token, so they stay fork-gated.
  // The production build needs no secrets and must run on fork pull requests.
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
  for (const name of ['ci', 'pr-checks', 'security'])
    assert.ok(!read(`.github/workflows/${name}.yml`).includes('paths-ignore:'));
});
test('metrics rejects an explicitly empty follow-up boundary before contacting GitHub', () => {
  const result = spawnSync(process.execPath, ['scripts/workflow-metrics.mjs', '--after', ''], {
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
      ['scripts/workflow-metrics.mjs', '--after', '2026-09-02', '--before', before],
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
  const result = spawnSync(process.execPath, ['scripts/check-ci-result.mjs'], {
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
  const lintStep = workflowStep(
    jobBlock(read('.github/workflows/ci.yml'), 'lint-format'),
    'Lint GitHub Actions workflows'
  );
  assert.match(lintStep, /if: needs.changes.outputs.workflows == 'true'/);
  assert.match(lintStep, /sha256sum --check --strict/);
  assert.match(lintStep, /zizmor==\$\{ZIZMOR_VERSION\}/);
  assert.match(read('scripts/validate-changes.mjs'), /workflows=\$\{plan.workflows\}/);
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
  const expected = fullJobs.filter((job) => !reduced.includes(job)).toSorted(alphabetical);
  assert.deepEqual(gated.toSorted(alphabetical), expected);
  for (const job of fullJobs)
    assert.ok(
      jobs.some((match) => match[1] === job),
      job
    );
});
