import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
test('only the aggregate CI job reports dispatched validation to branch rules', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = jobBlock(workflow, 'ci-result');
  assert.match(permissionsBlock(job, '    '), /^ {6}statuses: write$/m);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('\njobs:')), /statuses: write/);
  const validator = workflowStep(job, 'Require all selected jobs to succeed');
  assert.match(validator, /id: validation/);
  assert.match(validator, /run: node scripts\/check-ci-result.mjs/);
  const report = workflowStep(job, 'Report dispatched CI to branch rules');
  assert.match(report, /if: always\(\) && github.event_name == 'workflow_dispatch'/);
  assert.match(report, /VALIDATION_OUTCOME: \$\{\{ steps.validation.outcome \}\}/);
  assert.ok(
    job.indexOf('name: Require all selected jobs') < job.indexOf('name: Report dispatched CI')
  );
});
