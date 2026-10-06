// A refusal ends one request, never establishes review completion.
const BOT = 'chatgpt-codex-connector[bot]';
const LIMIT_MESSAGE = 'You have reached your Codex usage limits for code reviews.';
const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const unknown = (reason) => ({ kind: 'unknown', reason });
function isUsageLimit(comment) {
  return (comment.body ?? '').startsWith(LIMIT_MESSAGE);
}
function authenticated(comment) {
  const user = comment.user ?? {};
  return user.login === BOT && user.type === 'Bot';
}
function unchangedTimestamp(comment) {
  return (
    Number.isFinite(Date.parse(comment.created_at)) && comment.updated_at === comment.created_at
  );
}
export function usageLimitActivity(comment) {
  if (!isUsageLimit(comment)) return null;
  if (!authenticated(comment)) return unknown('Unauthenticated Codex usage-limit reply');
  if (!unchangedTimestamp(comment)) return unknown('Edited or invalid Codex usage-limit reply');
  return { kind: 'refused', at: Date.parse(comment.created_at) };
}
function completionMatches(request, event) {
  return event.kind === 'complete' && event.sha === request.sha && event.at >= request.at;
}
function completedBefore(request, activity, events) {
  return events.some((event) => event.at < activity.at && completionMatches(request, event));
}
function unresolvedBefore(request, activity, events) {
  if (wasRefused(request, events)) return false;
  return !completedBefore(request, activity, events);
}
function precedingRequests(activity, requests, events) {
  return requests
    .filter((request) => !request.local && request.at < activity.at)
    .filter((request) => unresolvedBefore(request, activity, events))
    .sort((a, b) => b.at - a.at);
}
function tiedRequest(activity, requests) {
  return requests.some((request) => !request.local && request.at === activity.at);
}
function validRefusedRequest(request, next) {
  return Boolean(request.sha) && request.unchanged && !next;
}
function requestRefusal(activity, requests, events) {
  const [request, next] = precedingRequests(activity, requests, events);
  if (!request) return unknown('Codex usage-limit reply has no preceding request');
  if (!validRefusedRequest(request, next))
    return unknown('Codex usage-limit reply has no unambiguous unchanged tagged request');
  return { ...activity, sha: request.sha, requestedAt: request.at };
}
function scopeRefusal(activity, requests, events) {
  if (activity.kind !== 'refused') return activity;
  if (tiedRequest(activity, requests))
    return unknown('Codex usage-limit reply and request have ambiguous same-second ordering');
  return requestRefusal(activity, requests, events);
}
export function scopeUsageLimits(activities, requests) {
  const scoped = [];
  const ordered = activities.toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0));
  for (const activity of ordered) scoped.push(scopeRefusal(activity, requests, scoped));
  return scoped;
}
export function wasRefused(request, activities) {
  return activities.some(
    (activity) =>
      activity.kind === 'refused' &&
      activity.sha === request.sha &&
      activity.requestedAt === request.at
  );
}
export function usageLimitState(context) {
  const refusal = context.activities
    .filter((activity) => activity.kind === 'refused')
    .sort((a, b) => b.at - a.at)[0];
  if (!refusal) return null;
  const retryAt = refusal.at + RETRY_DELAY_MS;
  if (context.now >= retryAt) return null;
  return {
    status: 'unavailable',
    retryAt,
    reason: `Codex declined a review due to usage limits; use another provider or a human. One guarded retry is eligible after ${new Date(retryAt).toISOString()}; this does not prove the limit has reset.`,
  };
}
