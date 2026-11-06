import { readdirSync } from 'node:fs';
import { isValidPlan } from './validation-plan.mjs';
const changelogPaths = new Set(['app/utils/changelog.ts', 'app/utils/__tests__/changelog.test.ts']);
const retainedTests = [
  'scripts/workflow-tests/release-commit.mjs',
  'scripts/workflow-tests/workflow-test-selection.mjs',
];
export function workflowTestFiles() {
  return [
    ...readdirSync('scripts/workflow-tests')
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => `scripts/workflow-tests/${name}`),
    ...readdirSync('scripts/codex-review')
      .filter((name) => name.endsWith('-tests.mjs'))
      .map((name) => `scripts/codex-review/${name}`),
  ].sort();
}
function readPlan(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function validPaths(plan) {
  return isValidPlan(plan) && plan.full && Array.isArray(plan.paths);
}
function changelogOnly(plan) {
  if (!validPaths(plan)) return false;
  return plan.paths.length > 0 && plan.paths.every((path) => changelogPaths.has(path));
}
export function selectWorkflowTests(files, env = process.env) {
  if (env.WORKFLOW_TEST_EVENT !== 'pull_request') return files;
  if (!changelogOnly(readPlan(env.WORKFLOW_TEST_PLAN))) return files;
  // Missing retained tests is an implementation error, never a successful empty run.
  if (!retainedTests.every((file) => files.includes(file))) return files;
  return retainedTests;
}
