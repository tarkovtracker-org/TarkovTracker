import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
function assertStatusBoundary(workflow) {
  const job = jobBlock(workflow, 'ci-result');
  const permissions = permissionsBlock(job, '    ')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .sort();
  assert.deepEqual(permissions, ['contents: read', 'statuses: write']);
  assert.doesNotMatch(workflow.replace(job, ''), /statuses: write/);
  assert.match(job, /steps:\n {6}- name: Checkout trusted CI aggregation\n/);
  assert.equal(job.match(/uses: actions\/checkout@/g)?.length, 1);
  const checkout = workflowStep(job, 'Checkout trusted CI aggregation');
  assert.match(checkout, /^ {8}uses: actions\/checkout@[a-f0-9]{40}$/m);
  assert.match(checkout, /^ {10}ref: \$\{\{ github\.event\.repository\.default_branch \}\}$/m);
  assert.match(checkout, /^ {10}persist-credentials: false$/m);
  const validator = workflowStep(job, 'Require all selected jobs to succeed');
  assert.match(validator, /^ {8}id: validation$/m);
  assert.match(validator, /^ {8}run: node scripts\/check-ci-result\.mjs$/m);
  const report = workflowStep(job, 'Report dispatched CI to branch rules');
  assert.match(report, /^ {8}if: always\(\) && github\.event_name == 'workflow_dispatch'$/m);
  assert.match(report, /^ {10}VALIDATION_OUTCOME: \$\{\{ steps\.validation\.outcome \}\}$/m);
  assert.match(
    report,
    /^ {8}uses: actions\/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3$/m
  );
  assert.ok(
    report.includes(
      'const { reportDispatchedCi } = await import(`${process.env.GITHUB_WORKSPACE}/scripts/report-dispatched-ci.mjs`);'
    )
  );
  assert.match(
    report,
    /^ {12}await reportDispatchedCi\(\{ github, context, outcome: process\.env\.VALIDATION_OUTCOME \}\);$/m
  );
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
test('status publication contracts reject misleading configuration changes', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const mutations = [
    ['      statuses: write', '      statuses: write\n      issues: write'],
    [
      "if: always() && github.event_name == 'workflow_dispatch'",
      "if: always() && github.event_name == 'workflow_dispatch' || true",
    ],
    ['id: validation', 'id: validation-other'],
    ['await reportDispatchedCi({', 'await unusedReporter({'],
    ['scripts/report-dispatched-ci.mjs', 'scripts/unrelated.mjs'],
  ];
  for (const [before, after] of mutations) {
    const changed = workflow.replace(before, after);
    assert.notEqual(changed, workflow, before);
    assert.throws(() => assertStatusBoundary(changed), before);
  }
  const candidateCheckout = workflow.replace(
    'ref: ${{ github.event.repository.default_branch }}',
    'ref: ${{ github.sha }}'
  );
  const decoy =
    '\n      - name: Unrelated\n        with:\n          ref: ${{ github.event.repository.default_branch }}\n';
  assert.notEqual(candidateCheckout, workflow);
  assert.throws(() => assertStatusBoundary(candidateCheckout + decoy));
});
