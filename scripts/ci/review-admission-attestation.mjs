// Exact-head approval commands. A single-line `/approve <head>` (or the older
// `/approve-sensitive <head>`) from a write collaborator approves sensitive paths; from a current
// repository admin it is also the exact-head review attestation. Editing or deleting the comment
// withdraws it: admission rereads live comments, and consumers recheck the comment itself.
// Edited comments never attest: a write collaborator can edit another user's comment, so an
// edited body cannot be attributed to its admin author.
import { requireEvidence } from './review-admission-policy.mjs';
const COMMANDS = ['/approve', '/approve-sensitive'];
/** True when `body` is exactly one approval command naming `head`. */
export function approvalCommand(body, head) {
  if (typeof body !== 'string' || body.includes('\n')) return false;
  return COMMANDS.some((command) => body.trim() === `${command} ${head}`);
}
/** Coarse event filter: the body starts with an approval command for any revision. */
export function approvalCommandPrefix(body) {
  if (typeof body !== 'string') return false;
  return COMMANDS.some((command) => body.trimStart().startsWith(`${command} `));
}
function userComment(comment) {
  return [comment?.user?.type === 'User', Number.isSafeInteger(comment?.user?.id)].every(Boolean);
}
function unedited(comment) {
  return [Boolean(comment.created_at), comment.updated_at === comment.created_at].every(Boolean);
}
async function currentAdmin(github, repo, user) {
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...repo,
      username: user.login,
    });
    return [data.role_name === 'admin', data.user?.id === user.id].every(Boolean);
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}
function attestation(comment, head) {
  return {
    provider: 'admin-attestation',
    reviewId: comment.id,
    commit: head,
    actorId: comment.user.id,
  };
}
/** Newest admin approval command for `head` among the PR's issue comments, or null. */
export async function currentAdminAttestation(github, repo, comments, head) {
  const candidates = comments
    .filter((comment) =>
      [userComment(comment), unedited(comment), approvalCommand(comment.body, head)].every(Boolean)
    )
    .toSorted((left, right) => right.id - left.id);
  for (const comment of candidates) {
    if (await currentAdmin(github, repo, comment.user)) return attestation(comment, head);
  }
  return null;
}
async function liveComment(github, repo, id) {
  try {
    const { data } = await github.rest.issues.getComment({ ...repo, comment_id: id });
    return data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
/** Recheck a receipt's admin attestation: same comment, unchanged command, author still admin. */
function matchesAttestation(comment, review) {
  if (!comment) return false;
  return [
    userComment(comment),
    comment.user?.id === review.actorId,
    unedited(comment),
    approvalCommand(comment.body, review.commit),
  ].every(Boolean);
}
export async function requireCurrentAdminAttestation(github, repo, review) {
  const comment = await liveComment(github, repo, review.reviewId);
  const valid =
    matchesAttestation(comment, review) && (await currentAdmin(github, repo, comment.user));
  requireEvidence(valid, 'Admin attestation was revoked, edited, or lost admin access.');
}
