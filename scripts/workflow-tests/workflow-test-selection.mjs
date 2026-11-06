import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectWorkflowTests, workflowTestFiles } from '../ci/workflow-test-selection.mjs';
import { classifyPaths, fullJobs } from '../ci/validation-plan.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const helper = 'app/utils/changelog.ts';
const helperTests = 'app/utils/__tests__/changelog.test.ts';
const all = workflowTestFiles();
const retained = [
  'scripts/workflow-tests/release-commit.mjs',
  'scripts/workflow-tests/workflow-test-selection.mjs',
];
function environment(paths, event = 'pull_request') {
  return { WORKFLOW_TEST_EVENT: event, WORKFLOW_TEST_PLAN: JSON.stringify(classifyPaths(paths)) };
}
test('changelog-only PRs retain release controls and selection regressions', () => {
  for (const paths of [[helper], [helperTests], [helper, helperTests]]) {
    assert.deepEqual(selectWorkflowTests(all, environment(paths)), retained);
    assert.deepEqual(classifyPaths(paths).jobs, fullJobs);
  }
  assert.ok(all.length > retained.length);
});
test('tooling, workflow, config, mixed and unknown changes retain every test', () => {
  for (const path of [
    'scripts/release/release-commit.sh',
    'scripts/ci/workflow-test-selection.mjs',
    'scripts/workflow-tests/release-commit.mjs',
    '.github/workflows/ci.yml',
    'package.json',
    'pnpm-lock.yaml',
    'vitest.config.ts',
    'unknown/path',
    'docs/topic.md',
  ]) {
    assert.deepEqual(selectWorkflowTests(all, environment([path])), all, path);
    assert.deepEqual(selectWorkflowTests(all, environment([helper, path])), all, path);
  }
});
test('missing, malformed, empty, non-PR and incomplete inventories fail back to full', () => {
  for (const plan of [
    undefined,
    '',
    '{',
    'null',
    '{}',
    '{"paths":[]}',
    '{"full":true,"paths":[42]}',
  ]) {
    assert.deepEqual(
      selectWorkflowTests(all, { WORKFLOW_TEST_EVENT: 'pull_request', WORKFLOW_TEST_PLAN: plan }),
      all
    );
  }
  assert.deepEqual(selectWorkflowTests(all, environment([])), all);
  for (const event of ['push', 'merge_group', 'workflow_dispatch', undefined]) {
    assert.deepEqual(
      selectWorkflowTests(all, { ...environment([helper]), WORKFLOW_TEST_EVENT: event }),
      all
    );
  }
  const incomplete = all.filter((file) => !file.endsWith('/release-commit.mjs'));
  assert.deepEqual(selectWorkflowTests(incomplete, environment([helper])), incomplete);
  assert.deepEqual(selectWorkflowTests(all, {}), all);
});
test('release consumers and required aggregate jobs remain covered', () => {
  const highlights = readFileSync('scripts/release/release-highlights.test.mjs', 'utf8');
  const scope = readFileSync('scripts/release/release-scope.test.mjs', 'utf8');
  assert.match(highlights, /from ['"]@\/utils\/changelog['"]/);
  assert.match(
    scope,
    /readFileSync\(new URL\('\.\.\/\.\.\/app\/utils\/changelog\.ts', import\.meta\.url\), 'utf8'\)/
  );
  assert.ok(classifyPaths([helper]).jobs.includes('test'));
  assertWorkflowContracts(readFileSync('.github/workflows/ci.yml', 'utf8'));
});
function assertWorkflowContracts(workflow) {
  const scanners = workflowStep(
    jobBlock(workflow, 'lint-format'),
    'Test blank-line scanners with coverage'
  );
  assert.match(scanners, /^ {8}if: needs.changes.outputs.tooling == 'true'$/m);
  assert.match(scanners, /^ {8}run: pnpm run test:blank-lines$/m);
  const tooling = workflowStep(jobBlock(workflow, 'lint-format'), 'Test workflow tooling');
  assert.match(tooling, /^ {8}if: needs.changes.outputs.tooling == 'true'$/m);
  assert.match(tooling, /^ {10}WORKFLOW_TEST_PLAN: \$\{\{ needs.changes.outputs.plan \}\}$/m);
  assert.match(tooling, /^ {10}WORKFLOW_TEST_EVENT: \$\{\{ github.event_name \}\}$/m);
  assert.match(tooling, /^ {8}run: pnpm run test:workflow$/m);
  const tests = jobBlock(workflow, 'test');
  assert.match(tests, /^ {4}if: needs.changes.outputs.full == 'true'$/m);
  const shard = workflowStep(tests, 'Run shard ${{ matrix.shard }}/${{ matrix.total }}');
  assert.match(shard, /^ {8}run: pnpm exec vitest run --coverage --shard="\$VITEST_SHARD"$/m);
}
test('workflow contracts reject decoys but allow step key reordering', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const tooling = workflowStep(jobBlock(workflow, 'lint-format'), 'Test workflow tooling');
  const guard = "        if: needs.changes.outputs.tooling == 'true'\n";
  const reordered = tooling.replace(guard, '') + '\n' + guard.trimEnd();
  assertWorkflowContracts(workflow.replace(tooling, reordered));
  const broken = tooling.replace('run: pnpm run test:workflow', 'run: echo disabled');
  const decoy = `\n  decoy:\n    steps:\n      - name: Test workflow tooling\n${tooling}`;
  assert.throws(() => assertWorkflowContracts(workflow.replace(tooling, broken) + decoy));
  const shard = workflowStep(
    jobBlock(workflow, 'test'),
    'Run shard ${{ matrix.shard }}/${{ matrix.total }}'
  );
  assert.throws(() =>
    assertWorkflowContracts(
      workflow.replace(shard, shard.replace('pnpm exec vitest run', 'echo disabled'))
    )
  );
});
test('incomplete plans and invalid job contracts retain the full suite', () => {
  const valid = classifyPaths([helper]);
  const invalid = [
    { full: true, paths: [helper] },
    { ...valid, jobs: undefined },
    { ...valid, jobs: [] },
    { ...valid, jobs: valid.jobs.filter((job) => job !== 'security') },
    { ...valid, jobs: [...valid.jobs, 'unknown-job'] },
    { ...valid, previewRequired: undefined },
    { ...valid, previewRequired: 'true' },
  ];
  for (const plan of invalid) {
    assert.deepEqual(
      selectWorkflowTests(all, {
        WORKFLOW_TEST_EVENT: 'pull_request',
        WORKFLOW_TEST_PLAN: JSON.stringify(plan),
      }),
      all
    );
  }
});
test('scanner coverage remains required on full validation', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(packageJson.scripts['test:blank-lines'], /(?:^|\s)--coverage(?:\s|$)/);
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = jobBlock(workflow, 'lint-format');
  const step = workflowStep(job, 'Test blank-line scanners with coverage');
  const brokenCommand = step.replace('run: pnpm run test:blank-lines', 'run: echo disabled');
  assert.throws(() =>
    assertWorkflowContracts(workflow.replace(job, job.replace(step, brokenCommand)))
  );
  const brokenGuard = step.replace("        if: needs.changes.outputs.tooling == 'true'\n", '');
  assert.throws(() =>
    assertWorkflowContracts(workflow.replace(job, job.replace(step, brokenGuard)))
  );
});
test('verified formatter profile retains every workflow-tooling regression', () => {
  const plan = classifyPaths(['pnpm-lock.yaml'], { formatterOnly: true });
  assert.equal(plan.full, false);
  assert.equal(plan.formatter, true);
  assert.deepEqual(
    selectWorkflowTests(all, {
      WORKFLOW_TEST_EVENT: 'pull_request',
      WORKFLOW_TEST_PLAN: JSON.stringify(plan),
    }),
    all
  );
  assertWorkflowContracts(readFileSync('.github/workflows/ci.yml', 'utf8'));
});
