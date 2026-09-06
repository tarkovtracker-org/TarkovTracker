import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measuredRun } from '../workflow-metrics-timing.mjs';
const run = {
  id: 42,
  head_sha: 'validated-sha',
  conclusion: 'success',
  run_attempt: 1,
  run_started_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:02:00Z',
};
const jobs = [
  { started_at: run.run_started_at, completed_at: run.updated_at, conclusion: 'success' },
  { started_at: run.run_started_at, completed_at: run.updated_at, conclusion: 'skipped' },
];
test('single attempt uses run timestamps and excludes skipped runner time', async () => {
  const result = await measuredRun(run, {
    pages: async () => jobs,
    api: async () => assert.fail('Single attempt needs no extra metadata'),
  });
  assert.equal(result.duration_minutes, 2);
  assert.deepEqual(result.attempts, [{ attempt: 1, runner_minutes: 2 }]);
});
test('rerun duration uses the latest attempt while runner minutes include all attempts', async () => {
  const requests = [];
  const result = await measuredRun(
    { ...run, run_attempt: 2, updated_at: '2026-09-02T00:03:00Z' },
    {
      pages: async (path) => {
        requests.push(path);
        return jobs;
      },
      api: async (path) => {
        assert.equal(path, 'actions/runs/42/attempts/2');
        return { run_started_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:03:00Z' };
      },
    }
  );
  assert.equal(result.duration_minutes, 3);
  assert.deepEqual(result.attempts, [
    { attempt: 1, runner_minutes: 2 },
    { attempt: 2, runner_minutes: 2 },
  ]);
  assert.deepEqual(requests, [
    'actions/runs/42/attempts/1/jobs',
    'actions/runs/42/attempts/2/jobs',
  ]);
});
test('unavailable latest attempt duration preserves runner minutes and identifies missing data', async () => {
  const result = await measuredRun(
    { ...run, run_attempt: 2 },
    {
      pages: async () => jobs,
      api: async () => {
        throw new Error('API unavailable');
      },
    }
  );
  assert.equal(result.duration_minutes, null);
  assert.equal(result.duration_unavailable, 'API unavailable');
  assert.equal(result.conclusion, 'success');
  assert.deepEqual(result.attempts, [
    { attempt: 1, runner_minutes: 2 },
    { attempt: 2, runner_minutes: 2 },
  ]);
});
