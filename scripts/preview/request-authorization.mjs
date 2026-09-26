const COMMANDS = new Map([
  ['/preview', true],
  ['/preview stop', false],
]);
/** Only exact commands in new comments express preview intent. */
export function previewCommand(body) {
  return COMMANDS.get(body) ?? null;
}
export async function isPreviewMaintainer(github, repo, username) {
  const { data } = await github.rest.repos
    .getCollaboratorPermissionLevel({ ...repo, username })
    .catch((error) => {
      if ([403, 404].includes(error.status)) return { data: {} };
      throw error;
    });
  return ['maintain', 'admin'].includes(data.role_name);
}
function originalCommand(comment, enabledAt) {
  const user = comment.user ?? {};
  return [
    previewCommand(comment.body) !== null,
    user.type === 'User',
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment.author_association),
    Boolean(user.login),
    user.login !== 'ghost',
    Number.isSafeInteger(comment.id) && comment.id > 0,
    Date.parse(comment.created_at) >= enabledAt,
    comment.created_at === comment.updated_at,
  ].every(Boolean);
}
async function cachedMaintainer(github, repo, login, permissions) {
  if (!permissions.has(login))
    permissions.set(login, await isPreviewMaintainer(github, repo, login));
  return permissions.get(login);
}
/**
 * Rollout activation. The opt-in contract activates at the instant shipped alongside the handler
 * that enforces it, so no manual post-merge variable flip is required: an unset or empty
 * `PREVIEW_OPT_IN_START` falls back to that instant. A defined variable must round-trip as a
 * canonical UTC ISO instant; the legacy `0`, date-only, zone-less or otherwise impossible values
 * fail closed and grant no persistent access. A canonical variable overrides the fallback for
 * continuity after handler reverts.
 */
const ROLLOUT_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
/** Parse a canonical UTC ISO-seconds string into its epoch milliseconds, or null. */
function canonicalInstant(value) {
  if (typeof value !== 'string') return null;
  if (!ROLLOUT_PATTERN.test(value)) return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  return instant;
}
/** Whether rendering `instant` reproduces the same canonical UTC ISO-seconds string. */
function roundTripsInstant(value, instant) {
  return new Date(instant).toISOString().replace('.000Z', 'Z') === value;
}
/** Canonical UTC ISO-seconds instant, or null when the value is not canonical UTC ISO. */
export function rolloutEnabledAt(value) {
  const instant = canonicalInstant(value);
  if (!Number.isFinite(instant)) return null;
  return roundTripsInstant(value, instant) ? instant : null;
}
const CONTRACT_START = '2026-09-26T04:12:26Z';
/** Resolve a configured override against the contract start; null when it is denied. */
function overrideRolloutStart(contractStart, configured) {
  const override = rolloutEnabledAt(configured);
  if (override === null) return configured ? null : contractStart;
  return override >= contractStart ? override : null;
}
export function previewRolloutStart() {
  const contractStart = rolloutEnabledAt(CONTRACT_START);
  // A constant that ever stops round-tripping denies everything, so the contract cannot be
  // silently resurrected from a pre-protocol activation instant like year 0000.
  if (!Number.isFinite(contractStart)) return null;
  return overrideRolloutStart(contractStart, process.env.PREVIEW_OPT_IN_START);
}
/**
 * Acceptance receipt for an authorized `/preview stop`: the request handler posts it only after
 * authenticating the command author and verifying maintain/admin access, so the receipt proves
 * the stop was accepted while its author held maintainer authority.
 */
const STOP_RECEIPT = /<!--\s*preview-receipt\s+stop=(\d+)\s+enabled=false\s*-->/;
const RECEIPT_BOT = 'github-actions[bot]';
export function previewStopReceipt(commentId) {
  return `<!-- preview-receipt stop=${commentId} enabled=false -->`;
}
function stopAcceptedByReceipt(comments, stop) {
  return comments.some((receipt) => receiptAcceptsStop(receipt, stop));
}
/** Whether the receipt comment was authored by the handler bot. */
function receiptByBot(receipt) {
  return receipt.user?.type === 'Bot' && receipt.user.login === RECEIPT_BOT;
}
/** Whether the receipt is unedited, has a valid id and strictly follows the stop command. */
function receiptFollowsStop(receipt, stop) {
  return (
    Number.isSafeInteger(receipt.id) &&
    receipt.id > stop.id &&
    receipt.created_at === receipt.updated_at &&
    Date.parse(receipt.updated_at) >= Date.parse(stop.created_at)
  );
}
/** Whether the receipt body binds the stop command's comment id. */
function receiptBindsStop(receipt, stop) {
  return Number(STOP_RECEIPT.exec(receipt.body ?? '')?.[1]) === stop.id;
}
function receiptAcceptsStop(receipt, stop) {
  return (
    receiptByBot(receipt) && receiptFollowsStop(receipt, stop) && receiptBindsStop(receipt, stop)
  );
}
async function effectiveCommand(github, repo, comment, permissions, comments) {
  // A newer stop is a revocation barrier when its author currently verifies as maintain/admin or
  // when the handler accepted it while verifying (receipt). A historical stop whose author lost
  // maintainer access and that carries no receipt must not stand; only a fresh, currently
  // authorized opt-in can resume previews.
  if (previewCommand(comment.body) === false)
    return (
      (await cachedMaintainer(github, repo, comment.user.login, permissions)) ||
      stopAcceptedByReceipt(comments, comment)
    );
  return cachedMaintainer(github, repo, comment.user.login, permissions);
}
/**
 * Read the latest unedited, authorized opt-in or revocation barrier. Intent belongs to this PR, so
 * later successful revisions refresh automatically. A later /preview stop revokes that intent.
 * Exhaust pagination before choosing a command; a newer stop must never be hidden by a page cap.
 */
export async function readPreviewRequest(github, repo, pullRequest) {
  // Commands predating rollout activation used the one-revision contract and must never become
  // standing grants. Unset configuration falls back to the contract start; malformed values fail.
  const enabledAt = previewRolloutStart();
  if (![Boolean(pullRequest), Number.isFinite(enabledAt)].every(Boolean)) return null;
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: pullRequest,
    per_page: 100,
  });
  const commands = comments
    .filter((comment) => originalCommand(comment, enabledAt))
    .toSorted((a, b) => b.id - a.id);
  const permissions = new Map();
  for (const comment of commands) {
    if (!(await effectiveCommand(github, repo, comment, permissions, comments))) continue;
    return {
      commentId: comment.id,
      enabled: previewCommand(comment.body),
      requestedBy: comment.user.login,
    };
  }
  return null;
}
