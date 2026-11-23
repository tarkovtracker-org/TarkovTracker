import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AdmissionPending, pendingWhileMissing } from '../ci/review-admission-policy.mjs';
const failure = (stderr) => () => {
  throw Object.assign(new Error('Command failed: gh api'), { stderr });
};
test('a run that is not visible yet stays pending; other read failures stay fatal', () => {
  assert.deepEqual(
    pendingWhileMissing(() => ({ data: { id: 1 } })),
    { data: { id: 1 } }
  );
  assert.throws(
    () => pendingWhileMissing(failure('gh: Not Found (HTTP 404)')),
    (error) => error instanceof AdmissionPending
  );
  for (const stderr of ['gh: Forbidden (HTTP 403)', 'gh: Server Error (HTTP 500)', undefined])
    assert.throws(
      () => pendingWhileMissing(failure(stderr)),
      (error) => !(error instanceof AdmissionPending),
      String(stderr)
    );
});
test('the CLI retries only workflow-run lookups and keeps pending as exit code 2', () => {
  const cli = readFileSync('scripts/ci/review-admission-cli.mjs', 'utf8');
  assert.equal(cli.match(/pendingWhileMissing\(/g)?.length, 1);
  assert.match(cli, /getWorkflowRun: async \(params\) =>\n\s+pendingWhileMissing\(/);
  assert.match(cli, /process\.exitCode = error instanceof AdmissionPending \? 2 : 1;/);
  assert.match(read('scripts/ci/github-ci-gate.sh'), /2\) sleep 5 ;;/);
});
function read(path) {
  return readFileSync(path, 'utf8');
}
