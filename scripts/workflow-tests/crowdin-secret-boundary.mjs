import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertCrowdinSecretBoundary } from '../ci/crowdin-secret-boundary.mjs';
const credentials = [{ name: 'CROWDIN_PROJECT_ID' }, { name: 'CROWDIN_PERSONAL_TOKEN' }];
function safe() {
  return {
    repository: { total_count: 0, secrets: [] },
    organization: { total_count: 0, secrets: [] },
    environment: { total_count: 2, secrets: structuredClone(credentials) },
    policies: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] },
    configuration: {
      deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
    },
  };
}
test('Crowdin scope check accepts migrated credentials with the existing main-only job', () => {
  assert.doesNotThrow(() => assertCrowdinSecretBoundary(safe()));
  const workflow = readFileSync('.github/workflows/crowdin.yml', 'utf8');
  assert.match(workflow, /environment:\n\s+name: merge-queue/);
});
test('a modified branch cannot recover a credential through an unchecked fallback scope', () => {
  for (const scope of ['repository', 'organization']) {
    for (const credential of credentials) {
      const snapshot = safe();
      snapshot[scope] = { total_count: 1, secrets: [credential] };
      assert.throws(() => assertCrowdinSecretBoundary(snapshot), /accessible without/);
    }
  }
});
test('missing credentials and broader ref policies fail closed', () => {
  for (const mutation of [
    (s) => (s.environment = { total_count: 0, secrets: [] }),
    (s) => (s.repository = { total_count: 1, secrets: [] }),
    (s) => (s.configuration = {}),
    (s) => (s.configuration.deployment_branch_policy = null),
    (s) => (s.policies.branch_policies[0].type = 'tag'),
    (s) => (s.policies.branch_policies[0].name = '*'),
    (s) => (s.policies = { total_count: 0, branch_policies: [] }),
  ]) {
    const snapshot = safe();
    mutation(snapshot);
    assert.throws(() => assertCrowdinSecretBoundary(snapshot));
  }
});
