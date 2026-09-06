import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
