import { completedReviewRequests, reviewRequestComments } from './codex-review-state.mjs';
const BOT = 'chatgpt-codex-connector[bot]';
const MINIMIZED_QUERY = `query ReviewCommandState($id: ID!) {
  node(id: $id) { ... on IssueComment { isMinimized } }
}`;
const MINIMIZE = `mutation ResolveReviewCommand($id: ID!) {
  minimizeComment(input: { subjectId: $id, classifier: RESOLVED }) {
    minimizedComment { isMinimized }
  }
}`;
function graphql(runGh, query, id) {
  const response = JSON.parse(runGh(['api', 'graphql', '-f', `query=${query}`, '-f', `id=${id}`]));
  if (response.errors) throw new Error('GitHub returned a comment minimization error.');
  return response;
}
function genuineEyes(reaction) {
  const user = reaction.user ?? {};
  return [reaction.content === 'eyes', user.login === BOT, user.type === 'Bot'].every(Boolean);
}
function acknowledged(context, comment) {
  if (!comment.reactions?.eyes) return false;
  const response = context.runGh([
    'api',
    '--paginate',
    '--slurp',
    `repos/${context.repo}/issues/comments/${comment.id}/reactions?per_page=100`,
  ]);
  return JSON.parse(response).flat().some(genuineEyes);
}
function eligibleComments(inputs) {
  return reviewRequestComments(inputs.comments).filter((comment) =>
    [
      comment.user?.type === 'User',
      Number.isSafeInteger(comment.id),
      comment.id > 0,
      typeof comment.node_id === 'string',
      Boolean(comment.node_id),
    ].every(Boolean)
  );
}
function minimizeAcknowledged(context, comment, completed) {
  if (context.minimizedNodes.has(comment.node_id)) return;
  if (!hasAcknowledgement(context, comment, completed)) return;
  if (alreadyMinimized(context, comment)) return;
  minimize(context, comment.node_id);
}
function hasAcknowledgement(context, comment, completed) {
  return completed.has(comment.id) || acknowledged(context, comment);
}
function alreadyMinimized(context, comment) {
  const response = graphql(context.runGh, MINIMIZED_QUERY, comment.node_id);
  const minimized = response.data?.node?.isMinimized;
  if (minimized === true) context.minimizedNodes.add(comment.node_id);
  return minimized !== false;
}
function minimizationSucceeded(response) {
  const data = response.data ?? {};
  const result = data.minimizeComment ?? {};
  return result.minimizedComment?.isMinimized === true;
}
function minimize(context, nodeId) {
  const minimized = graphql(context.runGh, MINIMIZE, nodeId);
  if (minimizationSucceeded(minimized)) context.minimizedNodes.add(nodeId);
}
/** Cosmetic cleanup only; no edits/deletions, review requests, guard state or findings changes. */
export function collapseReviewCommands(context, inputs) {
  const completed = new Set(completedReviewRequests(inputs).map((comment) => comment.id));
  for (const comment of eligibleComments(inputs)) {
    try {
      minimizeAcknowledged(context, comment, completed);
    } catch (error) {
      context.warn(`Could not collapse Codex review command ${comment.id}: ${error.message}`);
    }
  }
}
