// Comment commands and App-pinned controls share one ordered enable/stop timeline.
function timeOrder(left, right) {
  return Date.parse(right.at) - Date.parse(left.at);
}
function tiedOrder(left, right) {
  if (left.kind === right.kind) return right.sequence - left.sequence;
  return Number(left.request.enabled) - Number(right.request.enabled); // A cross-source tie stops.
}
export function comparePreviewIntents(left, right) {
  return timeOrder(left, right) || tiedOrder(left, right);
}
export function selectPreviewAuthorization(records) {
  const ordered = records.toSorted(comparePreviewIntents);
  const latest = ordered[0] ?? null;
  const stopIndex = ordered.findIndex((record) => !record.request.enabled);
  return { latest, grant: oldestGrant(ordered, stopIndex), stop: ordered[stopIndex] ?? null };
}
function oldestGrant(ordered, stopIndex) {
  const uninterrupted = stopIndex === -1 ? ordered : ordered.slice(0, stopIndex);
  return uninterrupted.at(-1) ?? null;
}
export function previewAuthorizationRequest(authorization, boundCommentId = null) {
  const { latest, grant, stop } = authorization;
  if (!latest) return null;
  if (!latest.request.enabled) return latest.request;
  return activePreviewRequest(latest, grant, stop, boundCommentId);
}
function activePreviewRequest(latest, grant, stop, boundCommentId) {
  if (boundCommentId) return boundPreviewRequest(grant, stop, boundCommentId);
  return latest.key === grant.key ? latest.request : { ...latest.request, grant: grant.request };
}
function boundPreviewRequest(grant, stop, boundCommentId) {
  if (grant?.request.commentId === boundCommentId) return grant.request;
  return stop?.request ?? null;
}
