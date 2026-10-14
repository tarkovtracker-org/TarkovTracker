import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mainValidationProblem } from './release-gate.mjs';
import { rollbackPromotion } from './release-promotion.mjs';
const execute = (tool, args) => execFileSync(tool, args, { encoding: 'utf8' }).trim();
function decodeResponse(output) {
  const match = /^HTTP\/\S+\s+(\d+)/.exec(output);
  if (!match) throw new Error('GitHub response has no HTTP status.');
  const httpStatus = Number(match[1]);
  if (httpStatus < 200 || httpStatus >= 300)
    throw Object.assign(new Error(`GitHub read failed: ${httpStatus}`), { status: httpStatus });
  return JSON.parse(
    output
      .split(/\r?\n\r?\n/)
      .slice(1)
      .join('\n\n')
  );
}
function readRequest(endpoint) {
  let output;
  try {
    output = execute('gh', ['api', '--include', endpoint]);
  } catch (error) {
    if (!error.stdout?.length) throw error;
    output = String(error.stdout);
  }
  return decodeResponse(output);
}
/** Fixed read-only REST routes; credentials remain in gh's existing environment. */
function readClient(repository) {
  const prefix = `repos/${repository}`;
  const resource = (suffix) => async (params) => ({
    data: readRequest(`${prefix}/${suffix(params)}`),
  });
  const paged = (suffix, field) => ({ suffix, field });
  const rest = {
    pulls: { get: resource((p) => `pulls/${p.pull_number}`) },
    git: { getRef: resource((p) => `git/ref/${p.ref}`) },
    repos: {
      get: async () => ({ data: readRequest(prefix) }),
      getReleaseByTag: resource((p) => `releases/tags/${p.tag}`),
      getCommit: resource((p) => `commits/${p.ref}`),
      getContent: resource((p) => `contents/${p.path}?ref=${p.ref}`),
      compareCommits: resource((p) => `compare/${p.base}...${p.head}`),
      listCommitStatusesForRef: paged((p) => `commits/${p.ref}/statuses`, null),
    },
    checks: {
      listForRef: paged(
        (p) => `commits/${p.ref}/check-runs?check_name=CI%20Result&filter=latest`,
        'check_runs'
      ),
    },
    actions: {
      listWorkflowRuns: resource(
        (p) => `actions/workflows/ci.yml/runs?branch=main&head_sha=${p.head_sha}&per_page=100`
      ),
      getWorkflowRunAttempt: resource(
        (p) => `actions/runs/${p.run_id}/attempts/${p.attempt_number}`
      ),
      getWorkflowRun: resource((p) => `actions/runs/${p.run_id}`),
      listJobsForWorkflowRun: paged((p) => `actions/runs/${p.run_id}/jobs`, 'jobs'),
      listWorkflowRunArtifacts: paged((p) => `actions/runs/${p.run_id}/artifacts`, 'artifacts'),
    },
  };
  const paginate = async ({ suffix, field }, params) => {
    const pages = JSON.parse(
      execute('gh', ['api', '--paginate', '--slurp', `${prefix}/${suffix(params)}`])
    );
    return pages.flatMap((page) => (field ? page[field] : page));
  };
  return { rest, paginate };
}
function requireArguments(repository, prNumber) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[\w.-]+$/.test(repository))
    throw new Error('Invalid owner/repo.');
  if (!/^\d+$/.test(prNumber)) throw new Error('Invalid version PR number.');
}
function requireCleanTopic() {
  const branch = execute('git', ['branch', '--show-current']);
  if (!branch || branch === 'main')
    throw new Error('Use a dedicated topic branch, not main/detached HEAD.');
  if (execute('git', ['status', '--porcelain']))
    throw new Error('Recovery requires a clean checkout.');
}
function requireRepositoryRoot() {
  if (execute('git', ['rev-parse', '--show-prefix']))
    throw new Error('Run recovery from the repository root.');
}
/** Run on a clean topic at fresh main: produce only a local, reviewable generated-assets diff. */
export async function prepareRollback(repository, prNumber) {
  requireArguments(repository, prNumber);
  requireRepositoryRoot();
  requireCleanTopic();
  const sha = execute('git', ['rev-parse', 'HEAD']);
  const github = readClient(repository);
  const [owner, repo] = repository.split('/');
  const { data: repositoryInfo } = await github.rest.repos.get();
  const context = { repo: { owner, repo }, payload: { repository: { id: repositoryInfo.id } } };
  if (!Number.isSafeInteger(repositoryInfo.id)) throw new Error('Missing repository identity.');
  const { data: main } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (main.object.sha !== sha) throw new Error('Checkout must match current main.');
  const problem = await mainValidationProblem({ github, context, sha });
  if (problem) throw new Error(problem);
  const result = await rollbackPromotion({ github, context, prNumber: Number(prNumber), sha });
  writeFileSync('package.json', result.manifest);
  writeFileSync('CHANGELOG.md', result.changelog);
  console.info(
    'Generated assets restored locally. Validate, review and merge this rollback PR through normal admission; then dispatch Release again. No remote writes or tags were made.'
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  await prepareRollback(process.argv[2] ?? '', process.argv[3] ?? '');
