import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertCrowdinSecretBoundary } from '../ci/crowdin-secret-boundary.mjs';
import { jobBlock } from './helpers/workflow-blocks.mjs';
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
  const sync = jobBlock(readFileSync('.github/workflows/crowdin.yml', 'utf8'), 'sync');
  assert.match(
    sync,
    /if: github\.repository == 'tarkovtracker-org\/TarkovTracker' && github\.ref == 'refs\/heads\/main'/
  );
  assert.match(sync, /environment:\n\s+name: merge-queue/);
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
    (s) => (s.organization = { total_count: 1, secrets: [] }),
    (s) => (s.environment.total_count = 3),
    (s) => (s.policies.total_count = 2),
    (s) => (s.configuration = {}),
    (s) => (s.configuration.deployment_branch_policy = null),
    (s) => (s.configuration.deployment_branch_policy.protected_branches = true),
    (s) => (s.configuration.deployment_branch_policy.custom_branch_policies = false),
    (s) => (s.policies.branch_policies[0].type = 'tag'),
    (s) => (s.policies.branch_policies[0].name = '*'),
    (s) => (s.policies = { total_count: 0, branch_policies: [] }),
  ]) {
    const snapshot = safe();
    mutation(snapshot);
    assert.throws(() => assertCrowdinSecretBoundary(snapshot), /must|Incomplete|missing from/);
  }
});
