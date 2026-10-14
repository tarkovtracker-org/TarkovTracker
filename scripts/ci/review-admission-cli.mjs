// Trusted workflow helper; gh authentication is inherited without printing credentials.
import { execFileSync } from 'node:child_process';
import { requireReviewAdmission } from './review-admission-binding.mjs';
import { AdmissionPending, requireEvidence, SHA } from './review-admission-policy.mjs';
function request(endpoint, flags = []) {
  return execFileSync('gh', ['api', endpoint, ...flags], {
    maxBuffer: 2000000,
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function json(endpoint) {
  return { data: JSON.parse(request(endpoint).toString('utf8')) };
}
function repository(params) {
  return `repos/${params.owner}/${params.repo}`;
}
function adapter() {
  return {
    paginate: async (endpoint, params) => {
      const pages = JSON.parse(
        request(endpoint(params), ['--paginate', '--slurp']).toString('utf8')
      );
      return pages.flatMap(pageItems);
    },
    rest: {
      repos: {
        listCommitStatusesForRef: (params) =>
          `${repository(params)}/commits/${params.ref}/statuses?per_page=100`,
        compareCommits: async (params) =>
          json(`${repository(params)}/compare/${params.base}...${params.head}`),
      },
      actions: {
        getWorkflowRun: async (params) =>
          json(`${repository(params)}/actions/runs/${params.run_id}`),
        listWorkflowRunArtifacts: (params) =>
          `${repository(params)}/actions/runs/${params.run_id}/artifacts?per_page=100`,
        downloadArtifact: async (params) => ({
          data: request(`${repository(params)}/actions/artifacts/${params.artifact_id}/zip`),
        }),
      },
    },
  };
}
function pageItems(page) {
  if (Array.isArray(page)) return page;
  requireEvidence(Array.isArray(page.artifacts), 'Missing artifact pagination data.');
  return page.artifacts;
}
async function main() {
  const [name, head, expectedRunId] = process.argv.slice(2);
  requireEvidence(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name ?? ''), 'Expected OWNER/REPO.');
  requireEvidence(SHA.test(head ?? ''), 'Expected exact 40-character head SHA.');
  const [owner, repo] = name.split('/');
  const receipt = await requireReviewAdmission({
    github: adapter(),
    repo: { owner, repo },
    head,
    expectedRunId,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
main().catch((error) => {
  process.stderr.write(`Review Admission: ${error.message}\n`);
  process.exitCode = error instanceof AdmissionPending ? 2 : 1;
});
