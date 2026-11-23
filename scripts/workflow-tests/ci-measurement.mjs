import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classifyPaths } from '../ci/validation-plan.mjs';
import { supabaseShadowDecision } from '../ci/supabase-shadow.mjs';
import { measuredRun } from '../ci/workflow-metrics-timing.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
test('shadow Supabase eligibility is limited to complete full UI-only plans', () => {
  const ui = 'app/features/tasks/TaskRow.vue';
  assert.equal(
    supabaseShadowDecision(classifyPaths([ui, 'app/assets/css/main.css', 'app/shell/AppBar.vue'])),
    'would-skip'
  );
  for (const path of [
    'app/server/api/tarkov/catalog.ts',
    'supabase/migrations/20260101_test.sql',
    'scripts/checks/check-supabase-db.sh',
    'pnpm-lock.yaml',
    'app/pages/../server/Hidden.vue',
  ]) {
    assert.equal(supabaseShadowDecision(classifyPaths([ui, path])), 'would-run', path);
  }
  assert.equal(supabaseShadowDecision(classifyPaths([])), 'not-applicable');
  assert.equal(supabaseShadowDecision(classifyPaths(['docs/guide.md'])), 'not-applicable');
  assert.equal(supabaseShadowDecision({ full: true, paths: [ui] }), 'not-applicable');
});
test('CI observes the shadow decision without using it to select the Supabase job', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const changes = jobBlock(workflow, 'changes');
  const measurement = workflowStep(changes, 'Observe Supabase DB selection');
  assert.match(measurement, /if: github.event_name == 'pull_request'/);
  assert.match(measurement, /continue-on-error: true/);
  assert.match(measurement, /VALIDATION_PLAN: \$\{\{ steps.plan.outputs.plan \}\}/);
  assert.match(measurement, /run: node scripts\/ci\/supabase-shadow.mjs/);
  assert.match(
    jobBlock(workflow, 'supabase-db'),
    /^    if: needs\.changes\.outputs\.full == 'true'$/mu
  );
});
const at = (seconds) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const job = (name, start, end, steps = []) => ({
  name,
  started_at: at(start),
  completed_at: at(end),
  conclusion: 'success',
  steps,
});
test('CI telemetry measures Vitest separately from overhead and estimates the Supabase gap', async () => {
  const shards = [24, 28, 32, 36].map((end, index) =>
    job(`Test (shard ${index + 1}/4)`, 5, end + 4, [job(`Run shard ${index + 1}/4`, 20, end)])
  );
  const jobs = [
    job('Validation plan', 0, 5),
    ...shards,
    job('Supabase DB', 5, 59),
    job('Coverage thresholds', 41, 54),
    job('CI Result', 60, 66),
    job('Codebase metrics', 55, 72),
  ];
  const run = { id: 1, run_attempt: 1 };
  const measured = await measuredRun(run, { pages: async () => jobs });
  assert.deepEqual(measured.attempts[0].ci_balance, {
    supabase_job_seconds: 54,
    supabase_only_gate_gap_seconds: 5,
    coverage_job_seconds: 13,
    shards: [
      { shard: 1, job_seconds: 23, vitest_seconds: 4 },
      { shard: 2, job_seconds: 27, vitest_seconds: 8 },
      { shard: 3, job_seconds: 31, vitest_seconds: 12 },
      { shard: 4, job_seconds: 35, vitest_seconds: 16 },
    ],
  });
  const incomplete = await measuredRun(run, {
    pages: async () => jobs.filter((item) => item !== shards[0]),
  });
  assert.equal(incomplete.attempts[0].ci_balance, undefined);
  const missingStep = { ...shards[0], steps: [] };
  const coverageLast = await measuredRun(run, {
    pages: async () => [
      ...jobs.filter((item) => item !== shards[0] && item.name !== 'Supabase DB'),
      missingStep,
      job('Supabase DB', 5, 45),
    ],
  });
  assert.equal(coverageLast.attempts[0].ci_balance.supabase_only_gate_gap_seconds, 0);
  assert.equal(coverageLast.attempts[0].ci_balance.shards[0].vitest_seconds, null);
});
test('CI telemetry accepts a complete shard matrix with a different total', async () => {
  const jobs = [
    job('Supabase DB', 0, 20),
    job('Coverage thresholds', 40, 45),
    job('CI Result', 45, 50),
    job('Test (shard 2/2)', 0, 40, [job('Run shard 2/2', 5, 35)]),
    job('Test (shard 1/2)', 0, 30, [job('Run shard 1/2', 5, 25)]),
  ];
  const run = { id: 1, run_attempt: 1 };
  const measured = await measuredRun(run, { pages: async () => jobs });
  assert.deepEqual(measured.attempts[0].ci_balance.shards, [
    { shard: 1, job_seconds: 30, vitest_seconds: 20 },
    { shard: 2, job_seconds: 40, vitest_seconds: 30 },
  ]);
  const mixed = await measuredRun(run, {
    pages: async () => [...jobs, job('Test (shard 2/3)', 0, 40)],
  });
  assert.equal(mixed.attempts[0].ci_balance, undefined);
});
