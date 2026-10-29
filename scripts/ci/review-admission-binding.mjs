import { readAdmissionArchive } from './review-admission-archive.mjs';
export { readAdmissionArchive } from './review-admission-archive.mjs';
import { admissionRun, allPages, validateAdmissionReceipt } from './review-admission-api.mjs';
import { requireCurrentAdminAttestation } from './review-admission-attestation.mjs';
import { requireEvidence, SHA } from './review-admission-policy.mjs';
async function admissionArtifact(github, repo, run, head) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: run.id,
  });
  const matches = artifacts.filter((item) => item.name === `review-admission-${head}`);
  requireEvidence(matches.length === 1, 'Admission artifact is missing or ambiguous.');
  const artifact = matches[0];
  requireEvidence(
    !artifact.expired && artifact.size_in_bytes <= 100000,
    'Admission artifact expired or oversized.'
  );
  return artifact;
}
export async function requireTrustedPolicySource(github, repo, sha) {
  requireEvidence(SHA.test(sha), 'Missing immutable controller policy source.');
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: sha,
    head: 'main',
  });
  requireEvidence(
    ['ahead', 'identical'].includes(comparison.status),
    'Admission policy source is not on trusted main history.'
  );
}
export async function requireReviewAdmission({ github, repo, head, number, expectedRunId }) {
  requireEvidence(Number.isSafeInteger(number) && number > 0, 'Expected a positive PR number.');
  const run = await admissionRun(github, repo, head, expectedRunId);
  const artifact = await admissionArtifact(github, repo, run, head);
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });
  const receipt = await readAdmissionArchive(Buffer.from(data), head);
  validateAdmissionReceipt(receipt, repo, head, run, number);
  await requireTrustedPolicySource(github, repo, receipt.workflowSourceSha);
  if (receipt.review.provider === 'admin-attestation')
    await requireCurrentAdminAttestation(github, repo, receipt.review);
  return receipt;
}
