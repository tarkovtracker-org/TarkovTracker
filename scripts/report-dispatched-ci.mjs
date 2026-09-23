// Dispatch-created job checks are excluded from branch-rule evaluation by GitHub.
// Publish the aggregate validator outcome as a commit status on the same immutable SHA.
const LOCALES_REF = 'refs/heads/locales';
const SHA = /^[0-9a-f]{40}$/;

function eligibleLocalesPull(pull, context) {
  const { head, base } = pull;
  if (!head || !base) return false;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  return [
    pull.state === 'open',
    pull.draft === false,
    head.ref === 'locales',
    base.ref === 'main',
    sameRepository(head, repository),
    sameRepository(base, repository),
    head.sha === context.sha,
    SHA.test(context.sha),
    SHA.test(String(base.sha)),
    SHA.test(String(pull.merge_commit_sha)),
  ].every(Boolean);
}

function sameRepository(branch, name) {
  return branch.repo?.full_name === name;
}

async function localesPull(github, context) {
  const { data: pulls } = await github.rest.pulls.list({
    ...context.repo,
    state: 'open',
    head: `${context.repo.owner}:locales`,
    base: 'main',
    per_page: 100,
  });
  const candidates = pulls.filter((pull) => eligibleLocalesPull(pull, context));
  return candidates.length === 1 ? candidates[0] : null;
}

async function matchingTree(github, context, pull) {
  const commits = await Promise.all(
    [context.sha, pull.merge_commit_sha].map((commit_sha) =>
      github.rest.git.getCommit({ ...context.repo, commit_sha })
    )
  );
  const headTree = commits[0].data.tree.sha;
  const mergeTree = commits[1].data.tree.sha;
  return [SHA.test(headTree), headTree === mergeTree].every(Boolean);
}

function unchangedPull(first, current, context) {
  return [
    eligibleLocalesPull(current, context),
    current.number === first.number,
    current.base?.sha === first.base.sha,
    current.merge_commit_sha === first.merge_commit_sha,
  ].every(Boolean);
}

async function exactTreeMergeSha(github, context) {
  const pull = await localesPull(github, context);
  if (!pull || !(await matchingTree(github, context, pull))) return null;
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: pull.number,
  });
  return unchangedPull(pull, current, context) ? pull.merge_commit_sha : null;
}

async function requiredMergeSha(github, context, state) {
  if (![state === 'success', context.ref === LOCALES_REF].every(Boolean)) return null;
  const mergeSha = await exactTreeMergeSha(github, context);
  if (!mergeSha) throw new Error('Cannot attest an unchanged exact-tree locales merge commit.');
  return mergeSha;
}

async function reportLocalesMergeCi(github, context, targetUrl, mergeSha) {
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: mergeSha,
    context: 'CI Result',
    state: 'success',
    description: `Validated identical tree on locales head ${context.sha.slice(0, 12)}.`,
    target_url: targetUrl,
  });
}

function validationStatus(outcome) {
  return outcome === 'success'
    ? { state: 'success', description: 'All selected CI jobs passed.' }
    : { state: 'failure', description: 'CI validation did not succeed.' };
}

export async function reportDispatchedCi({ github, context, outcome }) {
  if (context.eventName !== 'workflow_dispatch') return;
  const { state, description } = validationStatus(outcome);
  const targetUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const mergeSha = await requiredMergeSha(github, context, state);
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: context.sha,
    context: 'CI Result',
    state,
    description,
    target_url: targetUrl,
  });
  if (mergeSha) await reportLocalesMergeCi(github, context, targetUrl, mergeSha);
}
