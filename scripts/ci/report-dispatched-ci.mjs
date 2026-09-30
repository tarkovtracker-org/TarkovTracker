// Dispatch-created job checks are excluded from branch-rule evaluation by GitHub.
// Publish the aggregate validator outcome as a commit status on the same immutable SHA.
const LOCALES_REF = 'refs/heads/locales';
const SHA = /^[0-9a-f]{40}$/;
const MERGE_LOOKUP_ATTEMPTS = 12;
const MERGE_LOOKUP_INTERVAL_MS = 5000;
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
async function mainSha(github, context) {
  const { data } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  return data.object.sha;
}
async function currentBasePull(github, context) {
  const pull = await localesPull(github, context);
  if (!pull) return null;
  return pull.base.sha === (await mainSha(github, context)) ? pull : null;
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
    samePullIdentity(first, current, context),
    current.merge_commit_sha === first.merge_commit_sha,
  ].every(Boolean);
}
function samePullIdentity(first, current, context) {
  return [
    eligibleLocalesPull(current, context),
    current.number === first.number,
    current.base?.sha === first.base.sha,
  ].every(Boolean);
}
async function matchingCurrentPull(github, context, first) {
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: first.number,
  });
  return samePullIdentity(first, current, context) ? current : null;
}
async function pauseForMergeRetry(attempt) {
  if (attempt + 1 < MERGE_LOOKUP_ATTEMPTS)
    await new Promise((resolve) => setTimeout(resolve, MERGE_LOOKUP_INTERVAL_MS));
}
async function readyMergePull(github, context, first) {
  for (let attempt = 0; attempt < MERGE_LOOKUP_ATTEMPTS; attempt += 1) {
    const current = await matchingCurrentPull(github, context, first);
    if (!current) return null;
    if (SHA.test(String(current.merge_commit_sha))) return current;
    await pauseForMergeRetry(attempt);
  }
  return null;
}
function currentRevision(first, current, context, main) {
  return [unchangedPull(first, current, context), current.base?.sha === main].every(Boolean);
}
async function matchingReadyPull(github, context) {
  const pull = await currentBasePull(github, context);
  if (!pull) return null;
  const ready = await readyMergePull(github, context, pull);
  if (!ready) return null;
  if (!(await matchingTree(github, context, ready))) return null;
  return ready;
}
async function exactTreeMergeSha(github, context) {
  const ready = await matchingReadyPull(github, context);
  if (!ready) return null;
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: ready.number,
  });
  const baseSha = await mainSha(github, context);
  return currentRevision(ready, current, context, baseSha) ? ready.merge_commit_sha : null;
}
async function failedMergeSha(github, context) {
  const pull = await localesPull(github, context);
  if (!pull) return null;
  const ready = await readyMergePull(github, context, pull);
  return ready?.merge_commit_sha ?? null;
}
async function requiredMergeSha(github, context, state) {
  if (![state === 'success', context.ref === LOCALES_REF].every(Boolean)) return null;
  const mergeSha = await exactTreeMergeSha(github, context);
  if (!mergeSha) throw new Error('Cannot attest an unchanged exact-tree locales merge commit.');
  return mergeSha;
}
async function reportLocalesMergeCi(github, context, targetUrl, mergeSha, state) {
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: mergeSha,
    context: 'CI Result',
    state,
    description:
      state === 'success'
        ? `Validated identical tree on locales head ${context.sha.slice(0, 12)}.`
        : `Dispatched CI failed on locales head ${context.sha.slice(0, 12)}.`,
    target_url: targetUrl,
  });
}
function validationStatus(outcome) {
  return outcome === 'success'
    ? { state: 'success', description: 'All selected CI jobs passed.' }
    : { state: 'failure', description: 'CI validation did not succeed.' };
}
async function reportMergeStatus(github, context, targetUrl, mergeSha, state) {
  if (context.ref !== LOCALES_REF) return;
  const reportedMergeSha = state === 'success' ? mergeSha : await failedMergeSha(github, context);
  if (reportedMergeSha)
    await reportLocalesMergeCi(github, context, targetUrl, reportedMergeSha, state);
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
  await reportMergeStatus(github, context, targetUrl, mergeSha, state);
}
