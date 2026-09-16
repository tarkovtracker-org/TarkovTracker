import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
function assertStatusBoundary(workflow) {
  const job = jobBlock(workflow, 'ci-result');
  assert.match(permissionsBlock(job, '    '), /^ {6}statuses: write$/m);
  assert.doesNotMatch(workflow.replace(job, ''), /statuses: write/);
  assert.match(job, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  const validator = workflowStep(job, 'Require all selected jobs to succeed');
  assert.match(validator, /id: validation/);
  assert.match(validator, /run: node scripts\/check-ci-result.mjs/);
  const report = workflowStep(job, 'Report dispatched CI to branch rules');
  assert.match(report, /if: always\(\) && github.event_name == 'workflow_dispatch'/);
  assert.match(report, /VALIDATION_OUTCOME: \$\{\{ steps.validation.outcome \}\}/);
  assert.ok(
    job.indexOf('name: Require all selected jobs') < job.indexOf('name: Report dispatched CI')
  );
}
test('only the trusted aggregate CI job reports dispatched validation to branch rules', () => {
  assertStatusBoundary(readFileSync('.github/workflows/ci.yml', 'utf8'));
});
test('another job cannot receive status-write permissions', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const changed = workflow.replace(
    '  changes:\n',
    '  changes:\n    permissions:\n      statuses: write\n'
  );
  assert.notEqual(changed, workflow);
  assert.throws(() => assertStatusBoundary(changed));
});
test('the status-writing job cannot check out candidate code', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const changed = workflow.replace(
    'ref: ${{ github.event.repository.default_branch }}',
    'ref: ${{ github.sha }}'
  );
  assert.notEqual(changed, workflow);
  assert.throws(() => assertStatusBoundary(changed));
});
