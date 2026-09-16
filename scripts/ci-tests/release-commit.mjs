import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './helpers/automation-fixture.mjs';
/** Stage realistic generated assets without modifying application code. */
function releaseFixture(t) {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'package.json'), '{"private":true,"version":"1.2.3"}');
  writeFileSync(join(f.repo, 'CHANGELOG.md'), '# 1.2.3\n');
  return f;
}
test('release validates a staging commit before promoting that identical SHA without PAT bypass', (t) => {
  const f = releaseFixture(t);
  const result = f.release();
  assert.equal(result.status, 0, result.stderr);
  const sha = git(f.repo, 'rev-parse', 'HEAD');
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), sha);
  const pushes = f.pushes();
  assert.equal(pushes[0].credential, 'ci');
  assert.equal(pushes[0].args.at(-1), `${sha}:refs/heads/wip/release-1.2.3-123-1`);
  assert.equal(pushes[1].credential, 'main');
  assert.equal(pushes[1].args.at(-1), `${sha}:refs/heads/main`);
  assert.equal(git(f.repo, 'log', '-1', '--format=%s'), 'chore(release): 1.2.3');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD^'), f.base);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'branch', '--list', 'wip/release-*'), '');
});
test('failed staging CI leaves main unchanged and never attempts promotion', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ CHECK_CONCLUSION: 'failure' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CI Result did not succeed/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
});
test('concurrent main advancement is rejected by the actual Git push', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ RACE_MAIN_SHA: f.head });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-fast-forward|fetch first/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.head);
});
test('release refuses missing CI credentials or a missing strict CI policy', (t) => {
  const f = releaseFixture(t);
  assert.equal(f.release({ RELEASE_CI_TOKEN: '' }).status, 1);
  assert.equal(f.release({ RULES: '[]' }).status, 1);
  assert.equal(f.pushes().length, 0);
});
test('release refuses unrelated staged content', (t) => {
  const f = releaseFixture(t);
  writeFileSync(join(f.repo, 'unexpected.txt'), 'unrelated');
  git(f.repo, 'add', 'unexpected.txt');
  const result = f.release();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected staged release asset/);
  assert.equal(f.pushes().length, 0);
});
test('release staging runs ordinary CI while release publication retains its main-only gate', () => {
  const read = (path) => readFileSync(path, 'utf8');
  assert.match(read('.github/workflows/ci.yml'), /branches: \[main, develop, 'wip\/\*\*'\]/);
  assert.match(read('.github/workflows/release.yml'), /head_branch == 'main'/);
  assert.match(
    read('.github/workflows/release.yml'),
    /RELEASE_CI_TOKEN: \$\{\{ secrets.ACCESS_TOKEN_GITHUB \}\}/
  );
  assert.ok(JSON.parse(read('.releaserc.json')).plugins.includes('./scripts/release-commit.mjs'));
});
