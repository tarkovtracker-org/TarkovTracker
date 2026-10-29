// The inherited gh credential stays in the environment, never command arguments or output.
import { execFileSync } from 'node:child_process';
import { enqueuePullRequest } from './enqueue-pr.mjs';
import { queueSubmitterToken } from './queue-submitter.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
function request(args, input, env) {
  return JSON.parse(
    execFileSync('gh', ['api', ...args], {
      env,
      input,
      encoding: 'utf8',
      maxBuffer: 2000000,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  );
}
// Automation must not enqueue with the job token: GitHub would start no merge_group CI.
async function credentialEnv(repo) {
  const token = await queueSubmitterToken({ repo });
  if (!token) return process.env;
  if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write(`::add-mask::${token}\n`);
  return { ...process.env, GH_TOKEN: token, QUEUE_SUBMITTER_PRIVATE_KEY: '' };
}
async function main() {
  const [name, suppliedNumber, head] = process.argv.slice(2);
  requireEvidence(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name ?? ''), 'Expected OWNER/REPO.');
  requireEvidence(/^[1-9]\d*$/.test(suppliedNumber ?? ''), 'Expected a positive PR number.');
  const [owner, repo] = (name ?? '').split('/');
  const env = await credentialEnv({ owner, repo });
  const github = {
    rest: {
      pulls: {
        get: async ({ owner, repo, pull_number }) => ({
          data: request([`repos/${owner}/${repo}/pulls/${pull_number}`], undefined, env),
        }),
      },
    },
    graphql: async (query, variables) => {
      const result = request(
        ['graphql', '--input', '-'],
        JSON.stringify({ query, variables }),
        env
      );
      if (result.errors?.length) throw new Error('GitHub rejected guarded queue submission.');
      return result.data;
    },
  };
  const result = await enqueuePullRequest({
    github,
    repo: { owner, repo },
    number: Number(suppliedNumber),
    head,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch((error) => {
  process.stderr.write(`Queue submission: ${error.message}\n`);
  process.exitCode = 1;
});
