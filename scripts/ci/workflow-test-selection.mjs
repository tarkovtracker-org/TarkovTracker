import { readdirSync } from 'node:fs';
import { isValidPlan } from './validation-plan.mjs';
const changelogPaths = new Set(['app/utils/changelog.ts', 'app/utils/__tests__/changelog.test.ts']);
// App files that workflow tests read or that release and Crowdin tooling consumes.
const toolingAppPaths = new Set(['app/utils/locales.ts', ...changelogPaths]);
// Simple app paths only: every segment starts with a word character, so `..` never matches.
const appPath = /^app\/(?:[\w@-][\w.@-]*\/)*[\w@-][\w.@-]*$/u;
const selectionTests = ['scripts/workflow-tests/workflow-test-selection.mjs'];
const retainedTests = ['scripts/workflow-tests/release-commit.mjs', ...selectionTests];
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
const nonEmpty = (paths) => (Array.isArray(paths) && paths.length > 0 ? paths : null);
function planPaths(plan) {
  return isValidPlan(plan) && plan.full ? nonEmpty(plan.paths) : null;
}
const isAppPath = (path) => typeof path === 'string' && appPath.test(path);
function appOnly(path) {
  return isAppPath(path) && !path.startsWith('app/locales/') && !toolingAppPaths.has(path);
}
function reducedTests(paths) {
  if (paths.every(appOnly)) return selectionTests;
  if (paths.every((path) => changelogPaths.has(path))) return retainedTests;
  return null;
}
// Pull requests that change only app code skip the workflow suite, and changelog-only pull
// requests keep the release controls. Merge-group, push and dispatch runs always run everything.
export function selectWorkflowTests(files, env = process.env) {
  if (env.WORKFLOW_TEST_EVENT !== 'pull_request') return files;
  const paths = planPaths(readPlan(env.WORKFLOW_TEST_PLAN));
  const selected = paths && reducedTests(paths);
  // Missing selected tests is an implementation error, never a successful empty run.
  if (!selected?.every((file) => files.includes(file))) return files;
  return selected;
}
