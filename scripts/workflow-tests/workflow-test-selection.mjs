import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectWorkflowTests, workflowTestFiles } from '../ci/workflow-test-selection.mjs';
import { classifyPaths, fullJobs } from '../ci/validation-plan.mjs';
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
  assert.match(scope, /app\/utils\/changelog\.ts/);
  assert.ok(classifyPaths([helper]).jobs.includes('test'));
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(
    workflow,
    /name: Test workflow tooling\n\s+if: needs.changes.outputs.full == 'true'\n\s+env:\n\s+WORKFLOW_TEST_PLAN: \$\{\{ needs.changes.outputs.plan \}\}\n\s+WORKFLOW_TEST_EVENT: \$\{\{ github.event_name \}\}\n\s+run: pnpm run test:workflow/
  );
  assert.match(workflow, /pnpm exec vitest run/);
});
