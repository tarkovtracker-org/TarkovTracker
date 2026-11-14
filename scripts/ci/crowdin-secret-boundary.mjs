import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const CREDENTIALS = ['CROWDIN_PROJECT_ID', 'CROWDIN_PERSONAL_TOKEN'];
function completeList(value, key) {
  if (!value) throw new Error(`Incomplete ${key} metadata`);
  if (!Array.isArray(value[key])) throw new Error(`Incomplete ${key} metadata`);
  if (value.total_count !== value[key].length)
    throw new Error(
      `Incomplete ${key} metadata: expected ${value.total_count} entries, received ${value[key].length}; paginated metadata is required beyond 100 entries`
    );
  return value[key];
}
export function assertCrowdinSecretBoundary(snapshot) {
  const repository = completeList(snapshot.repository, 'secrets');
  const organization = completeList(snapshot.organization, 'secrets');
  const environment = completeList(snapshot.environment, 'secrets');
  const policies = completeList(snapshot.policies, 'branch_policies');
  for (const name of CREDENTIALS) assertCredential(name, repository, organization, environment);
  assertBranchPolicy(snapshot.configuration?.deployment_branch_policy);
  assertMainOnly(policies);
}
function assertCredential(name, repository, organization, environment) {
  if ([...repository, ...organization].some((secret) => secret.name === name))
    throw new Error(`${name} remains accessible without the protected environment`);
  if (!environment.some((secret) => secret.name === name))
    throw new Error(`${name} is missing from merge-queue`);
}
function assertBranchPolicy(policy) {
  if (policy?.custom_branch_policies !== true || policy.protected_branches !== false)
    throw new Error('merge-queue must use an explicit main-only branch policy');
}
function assertMainOnly(policies) {
  if (policies.length !== 1 || policies[0].name !== 'main' || policies[0].type !== 'branch')
    throw new Error('merge-queue must allow only branch main, without tag or wildcard rules');
}
function metadata(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = 'repos/tarkovtracker-org/TarkovTracker';
  const environment = `${root}/environments/merge-queue`;
  assertCrowdinSecretBoundary({
    repository: metadata(`${root}/actions/secrets?per_page=100`),
    organization: metadata(`${root}/actions/organization-secrets?per_page=100`),
    environment: metadata(`${environment}/secrets?per_page=100`),
    policies: metadata(`${environment}/deployment-branch-policies?per_page=100`),
    configuration: metadata(environment),
  });
  console.log('Crowdin credentials are isolated to the main-only merge-queue environment.');
}
