import { isDeepStrictEqual } from 'node:util';
import { readAdmissionArchive, requireTrustedPolicySource } from './review-admission-binding.mjs';
import {
  CROWDIN_REPOSITORY,
  crowdinCandidate,
  isCrowdinRepository,
  requireEvidence,
  SHA,
} from './review-admission-policy.mjs';
const REPOSITORY = CROWDIN_REPOSITORY.full_name;
function inventory(files) {
  return files
    .map(({ filename, status, sha }) => ({ filename, status, sha }))
    .toSorted((a, b) => a.filename.localeCompare(b.filename));
}
function regularLocale(tree, file) {
  const entries = tree.filter((entry) => entry.path === file.filename);
  if (entries.length !== 1) return false;
  return [
    entries[0].mode === '100644',
    entries[0].type === 'blob',
    entries[0].sha === file.sha,
  ].every(Boolean);
}
async function immutableTranslations(github, repo, pr, files) {
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: pr.base.sha,
    head: pr.head.sha,
  });
  if (!Array.isArray(comparison.files)) return false;
  if (!isDeepStrictEqual(inventory(comparison.files), inventory(files))) return false;
  const { data } = await github.rest.git.getTree({
    ...repo,
    tree_sha: pr.head.sha,
    recursive: '1',
  });
  return [
    data.truncated === false,
    Array.isArray(data.tree),
    files.every((file) => regularLocale(data.tree ?? [], file)),
  ].every(Boolean);
}
function trustedSync(run) {
  return [
    run.path === '.github/workflows/crowdin.yml',
    run.head_branch === 'main',
    isCrowdinRepository(run.repository),
    isCrowdinRepository(run.head_repository),
    ['schedule', 'workflow_dispatch'].includes(run.event),
    ['in_progress', 'completed'].includes(run.status),
    [null, 'success'].includes(run.conclusion),
    SHA.test(run.head_sha ?? ''),
    Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0,
  ].every(Boolean);
}
function matchingReceipt(receipt, pr, run) {
  return [
    receipt.schema === 1,
    receipt.repository === REPOSITORY,
    receipt.number === pr.number,
    receipt.headSha === pr.head.sha,
    receipt.runId === run.id,
    receipt.runAttempt === run.run_attempt,
    receipt.validation === 'format,i18n,systems',
  ].every(Boolean);
}
function artifactRunId(artifact) {
  const id = artifact.workflow_run?.id;
  return [Number.isSafeInteger(id), id > 0].every(Boolean) ? id : null;
}
async function validatedSource(github, repo, pr, artifact) {
  const runId = artifactRunId(artifact);
  if (!runId) return null;
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...repo,
    run_id: runId,
  });
  if (!trustedSync(run)) return null;
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });
  const receipt = await readAdmissionArchive(Buffer.from(data), pr.head.sha);
  if (!matchingReceipt(receipt, pr, run)) return null;
  await requireTrustedPolicySource(github, repo, run.head_sha);
  return {
    provider: 'crowdin-policy',
    kind: 'review-exempt',
    commit: pr.head.sha,
    runId: run.id,
    runAttempt: run.run_attempt,
    artifactId: artifact.id,
    workflowSourceSha: run.head_sha,
  };
}
function liveArtifact(artifact, name) {
  return [
    artifact.name === name,
    artifact.expired === false,
    Number.isSafeInteger(artifact.id) && artifact.id > 0,
    artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 100000,
  ].every(Boolean);
}
/** A trusted sync uploads this head-owned receipt only after format/i18n/systems validation. */
export async function crowdinEligibility(github, pr, files) {
  if (!crowdinCandidate(pr, files)) return null;
  const [owner, repoName] = REPOSITORY.split('/');
  const repo = { owner, repo: repoName };
  if (!(await immutableTranslations(github, repo, pr, files))) return null;
  const name = `crowdin-validated-${pr.number}-${pr.head.sha}`;
  const artifacts = await github.paginate('GET /repos/{owner}/{repo}/actions/artifacts', {
    ...repo,
    name,
    per_page: 100,
  });
  requireEvidence(Array.isArray(artifacts), 'Missing Crowdin provenance artifact inventory.');
  return validatedArtifacts(
    github,
    repo,
    pr,
    artifacts.filter((item) => liveArtifact(item, name))
  );
}
async function validatedArtifacts(github, repo, pr, artifacts) {
  for (const artifact of artifacts) {
    const source = await validatedSource(github, repo, pr, artifact);
    if (source) return source;
  }
  return null;
}
