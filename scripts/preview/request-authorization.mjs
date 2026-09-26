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
 * Read the latest unedited command from a current maintainer. Intent belongs to this PR, so
 * later successful revisions refresh automatically. A later /preview stop revokes that intent.
 * Exhaust pagination before choosing a command; a newer stop must never be hidden by a page cap.
 */
export async function readPreviewRequest(github, repo, pullRequest) {
  // Set this repository variable only after the new handler is on main. Earlier commands used
  // the one-revision contract and must never become standing grants. Missing config fails closed.
  const enabledAt = Date.parse(process.env.PREVIEW_OPT_IN_START);
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
    if (!(await cachedMaintainer(github, repo, comment.user.login, permissions))) continue;
    return {
      commentId: comment.id,
      enabled: previewCommand(comment.body),
      requestedBy: comment.user.login,
    };
  }
  return null;
}
