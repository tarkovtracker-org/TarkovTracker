import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyPaths, fullJobs } from '../validation-plan.mjs';
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
test('shadow rollout and fork restrictions retain existing CI coverage and Deno checks', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /--shadow/);
  assert.match(ci, /args\+=\(--full\)/);
  assert.match(ci, /vitest run --coverage --shard=/);
  assert.match(ci, /deno test supabase\/functions\/_shared\/\*\.deno\.test\.ts/);
  assert.match(ci, /github.event.pull_request.head.repo.fork != true/);
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
test('CI job-level full gates match the classifier manifest', () => {
  const jobs = [
    ...read('.github/workflows/ci.yml').matchAll(
      /^  ([a-z-]+):\n([\s\S]*?)(?=^  [a-z-]+:|$(?![\s\S]))/gm
    ),
  ];
  const gated = jobs
    .filter((match) => /^    if: needs.changes.outputs.full == 'true'$/m.test(match[2]))
    .map((match) => match[1]);
  const reduced = classifyPaths(['README.md']).jobs;
  assert.deepEqual(gated.sort(), fullJobs.filter((job) => !reduced.includes(job)).sort());
  for (const job of fullJobs)
    assert.ok(
      jobs.some((match) => match[1] === job),
      job
    );
});
