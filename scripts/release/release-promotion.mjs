import { isDeepStrictEqual } from 'node:util';
import { readPromotionArchive } from './release-promotion-receipt.mjs';
import { recoveryAssets, validatedVersion } from './release-recovery.mjs';
const RELEASE_BRANCH = /^wip\/release-(\d+\.\d+\.\d+)-(\d+)-(\d+)$/;
const BOT_ID = 41898282;
const FULL_SHA = /^[0-9a-f]{40}$/;
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
/** PR metadata locates evidence; authored bodies never authorize publication. */
export function promotionBranch(pr, repo) {
  const author = pr.user ?? {};
  const headRepo = pr.head.repo ?? {};
  const identity = [headRepo.full_name, author.id, author.type, pr.base.ref];
  if (!isDeepStrictEqual(identity, [`${repo.owner}/${repo.repo}`, BOT_ID, 'Bot', 'main']))
    return null;
  return RELEASE_BRANCH.exec(pr.head.ref);
}
async function content(github, repo, sha, path) {
  const { data } = await github.rest.repos.getContent({ ...repo, ref: sha, path });
  requireCondition(
    isDeepStrictEqual([data.type, data.encoding], ['file', 'base64']),
    'Unreadable promotion asset.'
  );
  return Buffer.from(data.content, 'base64').toString('utf8');
}
/** Bind the branch receipt to a real attempt of trusted main release code. */
async function preparationRun(github, repo, branch) {
  const runId = Number(branch[2]);
  const attempt = Number(branch[3]);
  requireCondition(
    [Number.isSafeInteger(runId), runId > 0, Number.isSafeInteger(attempt), attempt > 0].every(
      Boolean
    ),
    'Invalid preparation run/attempt.'
  );
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...repo,
    run_id: runId,
    attempt_number: attempt,
  });
  requireCondition(
    isDeepStrictEqual([run.id, run.run_attempt], [runId, attempt]),
    'Preparation run/attempt identity changed.'
  );
  const identity = [run.path, run.head_branch, run.head_repository?.full_name];
  requireCondition(
    isDeepStrictEqual(identity, [
      '.github/workflows/release.yml',
      'main',
      `${repo.owner}/${repo.repo}`,
    ]),
    'Untrusted version preparation run.'
  );
  requireCondition(
    ['schedule', 'workflow_dispatch'].includes(run.event),
    'Untrusted release trigger.'
  );
  requireCondition(FULL_SHA.test(run.head_sha), 'Invalid release source SHA.');
  return run;
}
async function sourceRun(github, repo, branch, head) {
  const run = await preparationRun(github, repo, branch);
  requireCondition(
    isDeepStrictEqual([run.status, run.conclusion], ['completed', 'success']),
    'Preparation did not succeed.'
  );
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: Number(branch[2]),
    per_page: 100,
  });
  requireCondition(
    artifacts.some((artifact) =>
      isDeepStrictEqual([artifact.name, artifact.expired], [`release-promotion-${head}`, false])
    ),
    'Missing run-owned version preparation receipt.'
  );
  return run.head_sha;
}
/** Source lineage plus content prove the exact version-only candidate, independent of PR text. */
export async function candidateEvidence(github, repo, pr, branch) {
  const baseSha = await sourceRun(github, repo, branch, pr.head.sha);
  return candidateAssets(github, repo, pr, branch, baseSha);
}
async function candidateAssets(github, repo, pr, branch, baseSha) {
  const { data: candidate } = await github.rest.repos.getCommit({ ...repo, ref: pr.head.sha });
  requireCondition(
    isDeepStrictEqual(
      candidate.parents.map((parent) => parent.sha),
      [baseSha]
    ),
    'Version candidate source changed.'
  );
  requireCondition(
    candidate.commit.message.trim() === `chore(release): ${branch[1]}`,
    'Version candidate message changed.'
  );
  const files = candidate.files.map((file) => `${file.status}:${file.filename}`).sort();
  requireCondition(
    isDeepStrictEqual(files, ['modified:CHANGELOG.md', 'modified:package.json']),
    'Version candidate changed application code.'
  );
  const notes = await recoveryAssets(github, repo, baseSha, pr.head.sha, branch[1]);
  requireCondition(
    await validatedVersion(github, repo, pr.head.sha),
    'Candidate CI/preview proof is missing.'
  );
  return { baseSha, candidate, notes, version: branch[1] };
}
/** An existing tag ends pending promotion; its target is still checked before recovery publishes. */
async function existingTag(github, repo, version) {
  try {
    return (await github.rest.git.getRef({ ...repo, ref: `tags/v${version}` })).data;
  } catch (error) {
    if (error.status !== 404) throw error;
    return null;
  }
}
/** A tag without publication still needs idempotent recovery; API errors do not mean absence. */
async function stablePublication(github, repo, version) {
  try {
    const { data } = await github.rest.repos.getReleaseByTag({ ...repo, tag: `v${version}` });
    requireCondition(
      isDeepStrictEqual([data.draft, data.prerelease], [false, false]),
      'Existing release is not stable.'
    );
    return true;
  } catch (error) {
    if (error.status !== 404) throw error;
    return false;
  }
}
/** Only an unchanged source and tree may become the released actual merged SHA. */
async function mergedEvidence(github, repo, pr, evidence, sha, requireValidation) {
  const { data: merged } = await github.rest.repos.getCommit({ ...repo, ref: pr.merge_commit_sha });
  requireCondition(
    sha === pr.merge_commit_sha,
    'Main advanced after version promotion; recover generated assets before retrying.'
  );
  requireCondition(
    isDeepStrictEqual(
      merged.parents.map((parent) => parent.sha),
      [evidence.baseSha]
    ),
    'Queue interleaved changes into the release; recover generated assets before retrying.'
  );
  requireCondition(
    merged.commit.tree.sha === evidence.candidate.commit.tree.sha,
    'Merged version tree differs from the reviewed candidate.'
  );
  requireCondition(
    !(requireValidation && !(await validatedVersion(github, repo, sha))),
    'Merged version CI/preview proof is missing.'
  );
  return { sha, version: evidence.version, notes: evidence.notes };
}
async function pendingPromotion(github, repo, prs, sha) {
  const manifest = JSON.parse(await content(github, repo, sha, 'package.json'));
  const pending = prs.filter(
    (pr) => pr.merged_at && promotionBranch(pr, repo)?.[1] === manifest.version
  );
  if (!pending.length) return null;
  const current = pending.filter((pr) => pr.merge_commit_sha === sha);
  if (current.length) {
    requireCondition(current.length === 1, 'Ambiguous current version promotion provenance.');
    return current[0];
  }
  if (await publishedHistoricalPromotion(github, repo, pending, manifest.version)) return null;
  requireCondition(
    pending.length === 1,
    'Main advanced beyond multiple unpublished snapshots; reviewed recovery is required.'
  );
  return pending[0];
}
async function publishedHistoricalPromotion(github, repo, pending, version) {
  const tag = await existingTag(github, repo, version);
  if (!tag) return false;
  const tagged = pending.filter((pr) => pr.merge_commit_sha === tag.object.sha);
  if (!isDeepStrictEqual([tag.object.type, tagged.length], ['commit', 1])) return false;
  const newest = newestPromotions(pending);
  if (!isDeepStrictEqual(newest, tagged)) return false;
  return stablePublication(github, repo, version);
}
function newestPromotions(promotions) {
  const times = promotions.map((pr) => Date.parse(pr.merged_at));
  requireCondition(times.every(Number.isFinite), 'Unknown historical promotion merge time.');
  const latest = Math.max(...times);
  return promotions.filter((_pr, index) => times[index] === latest);
}
async function alreadyPublished(github, repo, pr, version) {
  const tag = await existingTag(github, repo, version);
  if (!tag) return false;
  requireCondition(
    isDeepStrictEqual([tag.object.type, tag.object.sha], ['commit', pr.merge_commit_sha]),
    'Release tag conflicts with promotion.'
  );
  return stablePublication(github, repo, version);
}
async function publishablePromotion(github, repo, prs, sha, requireValidation) {
  const pr = await pendingPromotion(github, repo, prs, sha);
  if (!pr) return null;
  const branch = promotionBranch(pr, repo);
  if (await alreadyPublished(github, repo, pr, branch[1])) return null;
  const evidence = await candidateEvidence(github, repo, pr, branch);
  await reviewAdmission(github, repo, pr.head.sha, pr.number);
  const recovery = await mergedEvidence(github, repo, pr, evidence, sha, requireValidation);
  recovery.notes = await promotionGitHubNotes(github, repo, pr, branch, evidence);
  return {
    release: false,
    recovery,
    reason: `Publish reviewed version PR #${pr.number} at merged SHA ${sha}.`,
  };
}
/** Check pending promotion before semantic-release can prepare duplicate notes/version assets. */
export async function queuedRelease({ github, context, sha, requireValidation = false }) {
  const repo = context.repo;
  const prs = await github.paginate(github.rest.pulls.list, {
    ...repo,
    state: 'all',
    per_page: 100,
  });
  const open = prs.find((pr) => pr.state === 'open' && promotionBranch(pr, repo));
  if (open) {
    const held = await openPromotion(github, context, open, sha);
    if (held) return held;
  }
  if (!prs.some((pr) => pr.merged_at && promotionBranch(pr, repo))) return null;
  return publishablePromotion(github, repo, prs, sha, requireValidation);
}
/** Produce a safe, reviewed rollback diff for an unpublished stale promotion, never remote writes. */
export async function rollbackPromotion({ github, context, prNumber, sha }) {
  const repo = context.repo;
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: prNumber });
  const branch = promotionBranch(pr, repo);
  requireCondition(Boolean(branch && pr.merged_at), 'Not a merged trusted version PR.');
  const evidence = await candidateEvidence(github, repo, pr, branch);
  requireCondition(
    !(await existingTag(github, repo, evidence.version)),
    'Published/tagged version cannot be rolled back.'
  );
  requireCondition(
    !(await stablePublication(github, repo, evidence.version)),
    'Published version cannot be rolled back.'
  );
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: pr.merge_commit_sha,
    head: sha,
  });
  requireCondition(
    ['ahead', 'identical'].includes(comparison.status),
    'Promotion is not an ancestor of current main.'
  );
  const [currentManifest, candidateManifest, currentLog, candidateLog, oldManifest, oldLog] =
    await Promise.all([
      content(github, repo, sha, 'package.json'),
      content(github, repo, pr.head.sha, 'package.json'),
      content(github, repo, sha, 'CHANGELOG.md'),
      content(github, repo, pr.head.sha, 'CHANGELOG.md'),
      content(github, repo, evidence.baseSha, 'package.json'),
      content(github, repo, evidence.baseSha, 'CHANGELOG.md'),
    ]);
  if (currentLog !== candidateLog)
    throw new Error('Changelog changed after promotion; operator investigation required.');
  const manifest = JSON.parse(currentManifest);
  requireCondition(
    manifest.version === JSON.parse(candidateManifest).version,
    'Version changed after promotion.'
  );
  manifest.version = JSON.parse(oldManifest).version;
  return {
    manifest: JSON.stringify(manifest, null, 2) + '\n',
    changelog: oldLog,
    source: evidence.baseSha,
  };
}
async function reviewAdmission(github, repo, head, number) {
  const { requireReviewAdmission } = await import(
    new URL('../ci/review-admission-binding.mjs', import.meta.url)
  );
  await requireReviewAdmission({ github, repo, head, number });
}
async function promotionGitHubNotes(github, repo, pr, branch, evidence) {
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: Number(branch[2]),
    per_page: 100,
  });
  const matches = artifacts.filter(
    (artifact) => artifact.name === `release-promotion-${pr.head.sha}` && !artifact.expired
  );
  requireCondition(matches.length === 1, 'Missing or ambiguous GitHub publication receipt.');
  requireCondition(
    Number.isSafeInteger(matches[0].id) && matches[0].size_in_bytes <= 1024 * 1024,
    'Publication receipt is oversized or invalid.'
  );
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: matches[0].id,
    archive_format: 'zip',
  });
  const receipt = await readPromotionArchive(Buffer.from(data));
  const identity = [receipt.schema, receipt.source, receipt.candidate, receipt.version, receipt.pr];
  requireCondition(
    isDeepStrictEqual(identity, [
      1,
      evidence.baseSha,
      pr.head.sha,
      evidence.version,
      `https://github.com/${repo.owner}/${repo.repo}/pull/${pr.number}`,
    ]),
    'GitHub publication receipt provenance changed.'
  );
  requireCondition(
    typeof receipt.githubNotes === 'string' && receipt.githubNotes.length <= 1024 * 1024,
    'GitHub notes receipt is missing or oversized.'
  );
  return receipt.githubNotes;
}
const pendingPromotionResult = (pr, reason) => ({
  release: false,
  reason: `Version PR #${pr.number} ${reason}`,
});
const QUEUED_RELEASE_QUERY = `query($owner:String!,$repo:String!,$number:Int!) {
  repository(owner:$owner,name:$repo) { pullRequest(number:$number) { headRefOid mergeQueueEntry { id } } }
}`;
async function openPromotion(github, context, pr, sha) {
  const recovered = await recoverFailedPromotion(github, context, pr, sha);
  if (recovered !== undefined) return recovered;
  if (await currentSource(github, context.repo, pr, sha))
    return pendingPromotionResult(
      pr,
      'awaits reviewed merge; do not recreate or update its immutable head.'
    );
  if (!['schedule', 'workflow_dispatch'].includes(context.eventName))
    return pendingPromotionResult(
      pr,
      'has a stale source; the next ordinary Release run will verify safe regeneration.'
    );
  return regenerateStalePromotion(github, context, pr, sha);
}
async function currentSource(github, repo, pr, sha) {
  const { data: candidate } = await github.rest.repos.getCommit({ ...repo, ref: pr.head.sha });
  return candidate.parents[0]?.sha === sha;
}
async function recoverFailedPromotion(github, context, pr, sha) {
  if (!['schedule', 'workflow_dispatch'].includes(context.eventName)) return undefined;
  const evidence = await failedPreparationEvidence(github, context.repo, pr, sha);
  if (!evidence) return undefined;
  return replaceOpenPromotion(github, context, pr, sha, evidence);
}
async function staleEvidence(github, repo, pr, sha) {
  const branch = promotionBranch(pr, repo);
  const evidence = await candidateEvidence(github, repo, pr, branch);
  return replaceableEvidence(github, repo, evidence, sha, ['ahead']);
}
/** Failed attempts authorize reversible closure only; publication keeps sourceRun's success/receipt gates. */
async function failedPreparationEvidence(github, repo, pr, sha) {
  const branch = promotionBranch(pr, repo);
  const run = await preparationRun(github, repo, branch);
  if (
    ![run.status === 'completed', ['failure', 'cancelled'].includes(run.conclusion)].every(Boolean)
  )
    return null;
  const evidence = await candidateAssets(github, repo, pr, branch, run.head_sha);
  await replaceableEvidence(github, repo, evidence, sha, ['ahead', 'identical']);
  return {
    ...evidence,
    retryReason: 'its trusted preparation failed before durable publication evidence was completed',
  };
}
async function replaceableEvidence(github, repo, evidence, sha, allowedHistory) {
  requireCondition(
    !(await existingTag(github, repo, evidence.version)),
    'Tagged promotion cannot be replaced.'
  );
  requireCondition(
    !(await stablePublication(github, repo, evidence.version)),
    'Published promotion cannot be replaced.'
  );
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: evidence.baseSha,
    head: sha,
  });
  requireCondition(
    allowedHistory.includes(comparison.status),
    'Stale source is not a proven main ancestor.'
  );
  return evidence;
}
async function unqueuedPromotion(github, repo, pr) {
  const queried = (await github.graphql(QUEUED_RELEASE_QUERY, { ...repo, number: pr.number }))
    .repository?.pullRequest;
  requireCondition(Boolean(queried), 'Stale promotion queue metadata is missing.');
  requireCondition(queried.headRefOid === pr.head.sha, 'Stale promotion head changed.');
  requireCondition(Object.hasOwn(queried, 'mergeQueueEntry'), 'Promotion queue state is missing.');
  return queried.mergeQueueEntry === null;
}
function unchangedOpenPromotion(current, original, repo) {
  requireCondition(Boolean(promotionBranch(current, repo)), 'Promotion owner/branch changed.');
  requireCondition(current.head.sha === original.head.sha, 'Edited promotion must remain held.');
  return [
    current.state === 'open',
    current.draft === false,
    current.merged !== true,
    !current.merged_at,
  ].every(Boolean);
}
async function regenerateStalePromotion(github, context, pr, sha) {
  const repo = context.repo;
  const evidence = await staleEvidence(github, repo, pr, sha);
  return replaceOpenPromotion(github, context, pr, sha, evidence);
}
async function replaceOpenPromotion(github, context, pr, sha, evidence) {
  const repo = context.repo;
  if (!(await unqueuedPromotion(github, repo, pr)))
    return pendingPromotionResult(pr, 'is still queued; regeneration waits for removal.');
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  if (!unchangedOpenPromotion(current, pr, repo))
    return pendingPromotionResult(pr, 'is no longer open and ready.');
  return closeStalePromotion(github, repo, current, sha, evidence);
}
async function closeStalePromotion(github, repo, pr, sha, evidence) {
  const { data: main } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
  if (main.object.sha !== sha)
    return pendingPromotionResult(pr, 'waits for a fresh validated main run.');
  await github.rest.pulls.update({ ...repo, pull_number: pr.number, state: 'closed' });
  const { data: after } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  await checkedClosure(github, repo, after, pr);
  await github.rest.issues.createComment({
    ...repo,
    issue_number: pr.number,
    body: `Closed unchanged generated version snapshot ${pr.head.sha} because ${evidence.retryReason ?? `source ${evidence.baseSha} was superseded by validated main ${sha}`}. Branch history is retained; no version tag/publication or production data changed. This ordinary Release run will prepare a fresh version PR. Edited or queued snapshots are held instead.`,
  });
  return null;
}
async function checkedClosure(github, repo, after, expected) {
  requireCondition(after.merged !== true, 'Promotion merged concurrently; regeneration is held.');
  if (after.head.sha !== expected.head.sha) {
    if (after.state === 'closed')
      await github.rest.pulls.update({ ...repo, pull_number: expected.number, state: 'open' });
    throw new Error('Promotion changed during close; reopened and held for operator review.');
  }
  requireCondition(after.state === 'closed', 'Stale promotion closure was not confirmed.');
}
