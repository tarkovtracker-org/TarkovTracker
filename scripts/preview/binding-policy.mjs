function grantOf(request) {
  return request?.grant ?? request;
}
function controlId(request) {
  return String(request?.controlRunId ?? '');
}
export function previewBindingError(inputs, request) {
  const requested = inputs?.request_comment_id;
  if (!requested) return null;
  return requestedBindingError(inputs, grantOf(request));
}
function requestedBindingError(inputs, grant) {
  if (!grant?.enabled) return 'Preview command was revoked or superseded before dispatch.';
  if (String(inputs.request_comment_id) !== String(grant.commentId))
    return 'Preview command was revoked or superseded before dispatch.';
  return controlBindingError(inputs, grant);
}
function controlBindingError(inputs, grant) {
  const expected = String(inputs.request_control_run_id ?? '');
  return controlId(grant) === expected
    ? null
    : 'Preview control intent was revoked or superseded before dispatch.';
}
export function samePreviewAuthorization(actual, expected) {
  if ([!actual, !expected].some(Boolean)) return false;
  return [
    actual.enabled,
    actual.commentId === expected.commentId,
    actual.requestedBy === expected.requestedBy,
    controlId(actual) === controlId(expected),
  ].every(Boolean);
}
