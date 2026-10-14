import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admissionRun, allPages, validateAdmissionReceipt } from './review-admission-api.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
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
export async function readAdmissionArchive(bytes, head) {
  requireEvidence(bytes.byteLength <= 100000, 'Admission ZIP is oversized.');
  const directory = await mkdtemp(join(tmpdir(), 'review-admission-'));
  try {
    const archive = join(directory, 'receipt.zip');
    await writeFile(archive, bytes);
    return parseArchive(archive, head);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function parseArchive(archive, head) {
  const entries = execFileSync('unzip', ['-Z1', archive], {
    encoding: 'utf8',
    maxBuffer: 8192,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    killSignal: 'SIGKILL',
  }).trim();
  requireEvidence(
    entries === `${head}.json`,
    'Admission artifact must contain exactly the expected receipt.'
  );
  const json = execFileSync('unzip', ['-p', archive, entries], {
    encoding: 'utf8',
    maxBuffer: 100000,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
    killSignal: 'SIGKILL',
  });
  return JSON.parse(json);
}
async function trustedSource(github, repo, receipt) {
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: receipt.workflowSourceSha,
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
  await trustedSource(github, repo, receipt);
  return receipt;
}
