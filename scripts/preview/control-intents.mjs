import { currentControlState, controlRole } from '../ci/pr-control-state.mjs';
import { publisherConfig } from '../ci/review-admission-issuer.mjs';
import { requireEvidence } from '../ci/review-admission-policy.mjs';
function configuredControls(repo) {
  if (publisherConfig()) return true;
  const production =
    `${repo.owner}/${repo.repo}`.toLowerCase() === 'tarkovtracker-org/tarkovtracker';
  requireEvidence(!production, 'Preview controls require the configured admission App identity.');
  return false;
}
export function previewControlRecord({ run, commentId, actor, enabled }) {
  requireEvidence(
    Number.isFinite(Date.parse(run.created_at)),
    'Preview intent needs the server run timestamp.'
  );
  return {
    kind: 'control',
    key: `control-${run.id}`,
    sequence: run.run_number,
    at: run.created_at,
    actor,
    request: { commentId, controlRunId: run.id, enabled, requestedBy: actor.login },
  };
}
export function recoveryPreviewStop(state) {
  const run = { id: state.runId, run_number: state.runNumber, created_at: state.pointerCreatedAt };
  const record = previewControlRecord({
    run,
    commentId: state.commentId,
    actor: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
    enabled: false,
  });
  return { ...record, key: `recovery-${state.runId}` };
}
function requirePreviewControlRecord(record) {
  requireEvidence(
    [
      Number.isFinite(Date.parse(record.at)),
      Number.isSafeInteger(record.sequence),
      Number.isSafeInteger(record.request?.controlRunId),
    ].every(Boolean),
    'Preview control record is malformed.'
  );
}
async function authorizedRecord(github, repo, record) {
  requirePreviewControlRecord(record);
  if (!record.request.enabled) return record; // An accepted stop survives later role loss.
  const role = await controlRole(github, repo, record.actor);
  const allowed = [
    record.actor.type === 'User',
    role.user?.id === record.actor.id,
    ['maintain', 'admin'].includes(role.role_name),
  ].every(Boolean);
  return allowed ? record : { ...record, request: { ...record.request, enabled: false } };
}
export async function controlPreviewRecords(github, repo, number, options = {}) {
  if (!configuredControls(repo)) return [];
  const state = await previewControlState(github, repo, number, options);
  if (!state) return [];
  if (state.recovered) return [recoveryPreviewStop(state)];
  return validatedPreviewRecords(github, repo, state);
}
function previewControlState(github, repo, number, options) {
  if (options.controlState !== undefined) return options.controlState;
  return currentControlState(github, repo, number, { recover: true });
}
async function validatedPreviewRecords(github, repo, state) {
  const unique = new Map(
    [state.previewIntent, state.previewGrant, state.previewStop]
      .filter(Boolean)
      .map((record) => [record.key, record])
  );
  const records = [];
  for (const record of unique.values()) records.push(await authorizedRecord(github, repo, record));
  return records;
}
