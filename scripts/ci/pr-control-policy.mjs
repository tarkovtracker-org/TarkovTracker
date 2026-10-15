// Shared validation for the checkbox panel and the structured Actions entry point.
import { requireEvidence, SHA } from './review-admission-policy.mjs';
export const CONTROL_MARKER = '<!-- tarkovtracker:pr-controls:v1 -->';
export const CONTROL_ANCHOR = '44d4462c3db34b60e7cca69450405c922af15f56';
export const CONTROL_WRITE_LIMIT = 900;
export const revocationDescription = (number) =>
  `Admin review attestation revoked for PR #${number}; fresh admission is required.`;
export const CONTROL_WORKFLOW = '.github/workflows/pr-controls.yml';
export const CONTROL_ACTIONS = Object.freeze({
  'approve-review': 'Attest that I reviewed this exact commit (repository admin)',
  'revoke-review': 'Revoke the admin review attestation',
  'preview-enable': 'Enable automatic PR previews',
  'preview-stop': 'Stop automatic PR previews',
});
export const controlContext = (number) => `TarkovTracker Controls #${number}`;
export function controlEdit(oldBody, newBody, expectedBody) {
  requireEvidence(oldBody === expectedBody, 'The control panel revision is stale or altered.');
  const matches = Object.entries(CONTROL_ACTIONS).filter(([, label]) => {
    const before = `- [ ] ${label}`;
    return newBody === oldBody.replace(before, `- [x] ${label}`);
  });
  requireEvidence(
    matches.length === 1,
    'Change exactly one official checkbox; keep all other text unchanged.'
  );
  return matches[0][0];
}
function requireHumanActor(actor) {
  requireEvidence(
    [actor?.type === 'User', Number.isSafeInteger(actor?.id)].every(Boolean),
    'A human event sender is required.'
  );
}
export function requireControlActor(actor, permission, operation) {
  requireHumanActor(actor);
  requireEvidence(
    permission.user?.id === actor.id,
    'The live repository role belongs to a different actor.'
  );
  const roles = ['preview', 'preview-enable', 'preview-stop', 'recheck'].includes(operation)
    ? ['maintain', 'admin']
    : ['admin'];
  requireEvidence(
    roles.includes(permission.role_name),
    `${operation} requires ${roles.join(' or ')} access.`
  );
}
function lastIntentNumber(previous) {
  return previous?.lastIntentRunNumber ?? 0;
}
function requireFreshIntentRun(run, previousNumber) {
  requireEvidence(
    run.run_attempt === 1,
    'Workflow reruns cannot execute control operations; dispatch a new request.'
  );
  requireEvidence(
    run.actor?.id === run.triggering_actor?.id,
    'The original and triggering actors differ.'
  );
  requireEvidence(
    run.run_number > previousNumber,
    'A newer control operation already superseded this request.'
  );
}
export function requireControlOperation({ operation, expectedHead, pull, run, previous }) {
  requireEvidence(
    ['recheck', ...Object.keys(CONTROL_ACTIONS)].includes(operation),
    'Unsupported control operation.'
  );
  requireEvidence(
    [SHA.test(expectedHead), expectedHead === pull.head.sha].every(Boolean),
    'The requested commit is no longer the PR head.'
  );
  requireEvidence(
    [pull.state === 'open', !pull.draft].every(Boolean),
    'The PR must be open and ready.'
  );
  requireFreshIntentRun(run, lastIntentNumber(previous));
}
function statusLine(label, status) {
  if (!status) return `| ${label} | Waiting |`;
  const text = String(status.description ?? status.state)
    .replace(/[\r\n|<>[\]]/g, ' ')
    .slice(0, 180);
  return `| ${label} | ${status.state}: ${text} |`;
}
export function renderControlPanel({
  headSha,
  grant,
  checks,
  previewUrl,
  result,
  revision,
  state,
  terminal = false,
  previewMode = 'repository default',
}) {
  const review = grant
    ? `Admin attestation by @${grant.actor.login}, for this commit only.`
    : 'No admin attestation for this commit.';
  const preview = previewUrl
    ? `[Open preview](${previewUrl})`
    : 'Preview link appears after a validated deployment and smoke tests.';
  return [
    CONTROL_MARKER,
    '### TarkovTracker · PR controls',
    `**Commit:** \`${headSha}\``,
    `**Review:** ${review}`,
    `**Automatic PR previews:** ${previewMode}. ${preview}`,
    '',
    '| Gate | Current result |',
    '| :--- | :--- |',
    ...['CI Result', 'Preview Result', 'Review Admission'].map((label) =>
      statusLine(label, checks[label])
    ),
    '',
    ...panelActions(terminal),
    '',
    `**Last result:** ${result}`,
    '',
    `PR state: **${state}**. CI, preview, findings, and sensitive-change approval still apply.`,
    'Stop pauses automatic PR previews. Existing deployments remain available; manual and required queue previews use their own authorization.',
    panelGuidance(terminal),
    `<!-- revision:${revision} -->`,
  ].join('\n');
}
function panelActions(terminal) {
  return terminal ? [] : Object.values(CONTROL_ACTIONS).map((label) => `- [ ] ${label}`);
}
function panelGuidance(terminal) {
  return terminal
    ? 'Controls are disabled for this PR. Use provider/human review, /preview, /preview stop, or the existing manual preview workflow.'
    : 'Checkboxes reset after processing. Agents use the structured PR Controls workflow.';
}
