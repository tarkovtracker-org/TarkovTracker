// GitHub code-review evidence only: security results never establish code-review completion.
const BOT = 'chatgpt-codex-connector[bot]';
const SUMMARY = '<!-- codex-pull-request-review-summary -->';
const SHA = /^[0-9a-f]{7,40}$/i;
const GRACE_MS = 5 * 60 * 1000;
const unknown = (reason) => ({ kind: 'unknown', reason });
const status = (value, reason) => ({ status: value, reason });
const isCodex = (item) => item.user?.login === BOT;
const sameSha = (a, b) => a.startsWith(b) || b.startsWith(a);
const bodyOf = (item) => item.body ?? '';
const isSecurity = (body) => /^#{1,3}\s+.*Codex Security Review\b/im.test(body);
function completion(sha, time, result) {
  const at = Date.parse(time);
  if (!SHA.test(sha) || !Number.isFinite(at))
    return unknown('Invalid code-review commit or completion timestamp');
  return { kind: 'complete', sha: sha.toLowerCase(), at, result };
}
function resultFromBody(body) {
  return /didn't find any major issues|no findings|no issues found|no issues detected/i.test(body)
    ? 'clean'
    : 'findings';
}
function summaryStatus(cell, sha) {
  const time = cell.match(/<relative-time\s+datetime="([^"]+)"/i)?.[1];
  const label = cell
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\*\*Completed\*\*/i.test(label)) return completion(sha, time, 'unknown');
  if (/\b(running|queued|pending|in progress)\b/i.test(label)) {
    return {
      kind: 'pending',
      sha,
      at: Date.parse(time),
      reason: `Codex code review is running for ${sha}`,
    };
  }
  return unknown('Unrecognized Code Review status');
}
function summaryActivity(body) {
  const rows = body.split('\n').filter((line) => /\*\*Code Review\*\*/i.test(line));
  if (rows.length !== 1) return unknown('Missing or ambiguous Code Review summary row');
  const match = rows[0].match(
    /\|.*\*\*Code Review\*\*\s*\|\s*([^|]+)\|\s*`([0-9a-f]{7,40})`\s*\|/i
  );
  if (!match) return unknown('Unrecognized Code Review summary row');
  return summaryStatus(match[1], match[2].toLowerCase());
}
function commentActivity(comment) {
  const body = bodyOf(comment);
  if (body.includes(SUMMARY)) return summaryActivity(body);
  if (!/^Codex Review:/im.test(body))
    return unknown('Unrecognized Codex activity; inspect before requesting');
  const sha = body.match(/\*{0,2}Reviewed commit:\*{0,2}\s*`?([0-9a-f]{7,40})`?/i)?.[1];
  return completion(sha, comment.created_at, resultFromBody(body));
}
function formalActivity(review) {
  if (review.state === 'PENDING') {
    return {
      kind: 'pending',
      sha: review.commit_id ?? '',
      at: NaN,
      reason: 'Codex formal review is pending',
    };
  }
  if (!/^#{1,3}\s+.*Codex Review/im.test(bodyOf(review)))
    return unknown('Unrecognized Codex formal review');
  return completion(review.commit_id, review.submitted_at, resultFromBody(bodyOf(review)));
}
function collectActivities(comments, reviews) {
  const codeComments = comments.filter(isCodex).filter((item) => !isSecurity(bodyOf(item)));
  const codeReviews = reviews.filter(isCodex).filter((item) => !isSecurity(bodyOf(item)));
  return [...codeComments.map(commentActivity), ...codeReviews.map(formalActivity)];
}
function isRequest(comment) {
  if (isCodex(comment)) return false;
  return /^\s*@codex\s+review(?:\s|$)/im.test(bodyOf(comment));
}
function requestRecord(comment) {
  const sha = bodyOf(comment).match(/codex-review-request:([0-9a-f]{7,40})/i)?.[1];
  return {
    sha: sha?.toLowerCase(),
    at: Date.parse(comment.created_at),
    reason: 'A Codex review request has no matching completion',
  };
}
function intentRecord(intent) {
  return {
    sha: intent.sha,
    at: intent.createdAt,
    reason: `A prior request intent for ${intent.sha.slice(0, 12)} is unresolved`,
  };
}
function finishesRequest(completed, request) {
  if (!Number.isFinite(request.at)) return false;
  if (completed.at <= request.at) return false;
  return !request.sha || sameSha(completed.sha, request.sha);
}
function outstanding(requests, completed) {
  return requests.filter((request) => !completed.some((item) => finishesRequest(item, request)));
}
function blocksCurrent(request, current) {
  if (!current) return true;
  if (request.at <= current.at) return false;
  return !request.sha || sameSha(request.sha, current.sha);
}
function pendingActivity(context) {
  const active = outstanding(
    context.activities.filter((item) => item.kind === 'pending'),
    context.completed
  );
  const item = active[0];
  return item ? status('pending', item.reason) : null;
}
function requestedReviewer(context) {
  const users = context.requestedReviewers.users ?? [];
  return users.some((user) => user.login === BOT)
    ? status('pending', 'Codex is still a requested reviewer')
    : null;
}
function pendingRequest(context) {
  if (context.requests.some((item) => !Number.isFinite(item.at)))
    return status('unknown', 'Invalid review request timestamp');
  const item = outstanding(context.requests, context.completed).find((request) =>
    blocksCurrent(request, context.current)
  );
  return item ? status('pending', item.reason) : null;
}
function currentCompletion(context) {
  return context.current ? { status: 'complete', result: context.current.result } : null;
}
function unknownActivity(context) {
  const item = context.activities.find((activity) => activity.kind === 'unknown');
  return item ? status('unknown', item.reason) : null;
}
function eligiblePull(context) {
  if (context.pull.state !== 'open') return status('unknown', 'PR is not open');
  if (context.pull.draft) return status('unknown', 'PR is still a draft');
  if (context.now - lastActivityAt(context) < GRACE_MS)
    return status('pending', 'Automatic review startup grace period is active');
  return { status: 'unreviewed' };
}
function lastActivityAt(context) {
  const updatedAt = Date.parse(context.pull.updated_at);
  return Number.isFinite(updatedAt) ? Math.max(updatedAt, context.createdAt) : context.createdAt;
}
function buildContext(inputs, now, headSha) {
  const { comments = [], reviews = [], intents = [], requestedReviewers = {} } = inputs;
  const activities = collectActivities(comments, reviews);
  const completed = activities.filter((item) => item.kind === 'complete');
  const current = completed
    .filter((item) => headSha.startsWith(item.sha))
    .sort((a, b) => b.at - a.at)[0];
  const requests = [...comments.filter(isRequest).map(requestRecord), ...intents.map(intentRecord)];
  return {
    ...inputs,
    requestedReviewers,
    activities,
    completed,
    current,
    requests,
    now,
    createdAt: Date.parse(inputs.pull.created_at),
  };
}
export function classifyState(inputs, now = Date.now()) {
  const headSha = inputs.pull.head?.sha?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(headSha)) return status('unknown', 'PR head is missing or invalid');
  const context = buildContext(inputs, now, headSha);
  if (!Number.isFinite(context.createdAt)) return status('unknown', 'PR creation time is invalid');
  const decisions = [
    pendingActivity,
    requestedReviewer,
    pendingRequest,
    currentCompletion,
    unknownActivity,
    eligiblePull,
  ];
  const decision = decisions.map((decide) => decide(context)).find(Boolean);
  return { ...decision, headSha };
}
