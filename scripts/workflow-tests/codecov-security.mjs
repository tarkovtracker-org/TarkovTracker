import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveProfileOutputs } from '../preview/build-profile.mjs';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
test('candidate workflows never reference a reusable Codecov secret', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /secrets\.CODECOV_TOKEN/);
  for (const name of ['test', 'validate']) {
    assert.match(permissionsBlock(jobBlock(workflow, name), '    '), /^\s+id-token: write$/m);
  }
  const tests = jobBlock(workflow, 'test');
  for (const name of ['Upload coverage to Codecov', 'Upload test results to Codecov']) {
    const upload = workflowStep(tests, name);
    assert.match(upload, /use_oidc: true/);
    assert.doesNotMatch(upload, /CODECOV_TOKEN|token: \$\{\{/);
  }
});
test('profile resolution cannot relay a reusable token, including trusted main builds', () => {
  for (const signal of [
    { EVENT_NAME: 'push', REF_NAME: 'main' },
    { EVENT_NAME: 'workflow_dispatch', REF_NAME: 'main' },
    { EVENT_NAME: 'pull_request', PR_NUMBER: '7' },
    { EVENT_NAME: 'workflow_dispatch', REF_NAME: 'candidate' },
    { EVENT_NAME: 'merge_group', REF_NAME: 'gh-readonly-queue/main/pr-7' },
  ]) {
    const { buildEnv, decision } = resolveProfileOutputs({
      ...signal,
      GITHUB_ACTIONS: 'true',
      CODECOV_TOKEN: 'must-never-be-exported',
    });
    assert.equal(buildEnv.CODECOV_TOKEN, '');
    assert.equal(buildEnv.CODECOV_USE_OIDC, decision.profile === 'production' ? 'true' : '');
  }
});
test('bundle analysis uses supported OIDC without static credential fallback', () => {
  const config = readFileSync('nuxt.config.ts', 'utf8');
  assert.doesNotMatch(config, /process\.env\.CODECOV_TOKEN|uploadToken:/);
  assert.match(config, /useGitHubOIDC: true/);
  assert.match(config, /process\.env\.CODECOV_USE_OIDC === 'true'/);
});
