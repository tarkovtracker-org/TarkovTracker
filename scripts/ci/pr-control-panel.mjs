// Read-only presentation evidence; none of these fields authorize admission or deployment.
import { allPages } from './review-admission-api.mjs';
import { readAdmissionArchive } from './review-admission-archive.mjs';
import { expectedPublisherBot } from './review-admission-issuer.mjs';
const ACTIONS_BOT = 41898282;
function gateStatus(statuses, name, botId) {
  const status = statuses.find((item) => item.context === name);
  if (!status) return null;
  if (status.creator?.id !== botId)
    return { state: 'failure', description: 'Unexpected status issuer.' };
  return { state: status.state, description: status.description, target_url: status.target_url };
}
function previewRunId(status, repo) {
  const prefix = `https://github.com/${repo.owner}/${repo.repo}/actions/runs/`;
  const url = String(status.target_url ?? '');
  const id = url.startsWith(prefix) ? url.slice(prefix.length) : '';
  return /^[1-9]\d*$/.test(id) ? Number(id) : null;
}
async function previewLink(github, repo, head, status) {
  if (!status) return null;
  if (status.state !== 'success') return null;
  const id = previewRunId(status, repo);
  if (id === null) return null;
  return validatedPreviewLink(github, repo, head, id);
}
async function validatedPreviewLink(github, repo, head, id) {
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: id });
  return validPreviewRun(run, repo) ? deploymentLink(github, repo, head, run) : null;
}
function validPreviewRun(run, repo) {
  return [
    run.path === '.github/workflows/preview.yml',
    run.event === 'workflow_dispatch',
    run.head_branch === 'main',
    run.repository?.full_name === `${repo.owner}/${repo.repo}`,
    run.status === 'completed',
    run.conclusion === 'success',
  ].every(Boolean);
}
async function deploymentLink(github, repo, head, run) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: run.id,
  });
  const matches = artifacts.filter(
    (item) => item.name === `preview-deployment-${head}` && !item.expired
  );
  if (matches.length !== 1 || matches[0].size_in_bytes > 100000) return null;
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: matches[0].id,
    archive_format: 'zip',
  });
  const record = await readAdmissionArchive(Buffer.from(data), 'deployment-evidence');
  return validDeployment(record, head, run.id) ? record.url : null;
}
function validDeployment(record, head, runId) {
  return [
    record.project === 'tarkovtracker',
    record.environment === 'preview',
    record.commitHash === head,
    String(record.controllerRunId) === String(runId),
    /^preview-/.test(record.branch),
    /^https:\/\/[a-f0-9-]+\.tarkovtrackernuxt\.pages\.dev\/?$/.test(record.url),
  ].every(Boolean);
}
export async function controlPanelEvidence(github, repo, head) {
  const statuses = await allPages(github, github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: head,
  });
  const checks = await allPages(github, github.rest.checks.listForRef, {
    ...repo,
    ref: head,
    filter: 'latest',
  });
  const ci = checks.find(
    (item) => item.name === 'CI Result' && item.app?.id === 15368 && item.head_sha === head
  );
  const preview = gateStatus(statuses, 'Preview Result', ACTIONS_BOT);
  return {
    checks: {
      'CI Result': ci ? { state: ci.conclusion ?? ci.status, description: ci.name } : null,
      'Preview Result': preview,
      'Review Admission': gateStatus(statuses, 'Review Admission', expectedPublisherBot()),
    },
    previewUrl: await previewLink(github, repo, head, preview).catch(() => null),
  };
}
