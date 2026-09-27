// GitHub code-review evidence only: security results never establish code-review completion.
const BOT = 'chatgpt-codex-connector[bot]';
const SUMMARY = '<!-- codex-pull-request-review-summary -->';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const ABBREVIATED_SHA = /^[0-9a-f]{7,39}$/i;
const GRACE_MS = 5 * 60 * 1000;
const REQUEST_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const unknown = (reason) => ({ kind: 'unknown', reason });
const status = (value, reason) => ({ status: value, reason });
const isCodex = (item) => item.user?.login === BOT;
const bodyOf = (item) => item.body ?? '';
const isSecurity = (body) => /^#{1,3}[ \t]+[^\r\n]*Codex Security Review\b/i.test(body.trimStart());
function resolvedAbbreviation(sha, resolvedShas) {
  if (!ABBREVIATED_SHA.test(sha)) return null;
  return resolvedShas?.[sha] ?? null;
}
function resolveSha(sha, resolvedShas) {
  const normalized = String(sha ?? '').toLowerCase();
  const fullSha = FULL_SHA.test(normalized)
    ? normalized
    : resolvedAbbreviation(normalized, resolvedShas);
  if (!FULL_SHA.test(fullSha)) return null;
  return fullSha.toLowerCase();
}
function addAbbreviatedSha(shas, sha) {
  if (ABBREVIATED_SHA.test(sha ?? '')) shas.add(sha.toLowerCase());
}
function summarySha(body) {
  const rows = body.split('\n').filter((line) => /\*\*Code Review\*\*/i.test(line));
  if (rows.length !== 1) return null;
  return rows[0].match(/\|.*\*\*Code Review\*\*\s*\|\s*([^|]+)\|\s*`([0-9a-f]{7,40})`\s*\|/i)?.[2];
}
function reviewedSha(body) {
  if (!/^Codex Review:/im.test(body) || isSecurity(body)) return null;
  return body.match(/\*{0,2}Reviewed commit:\*{0,2}\s*`?([0-9a-f]{7,40})`?/i)?.[1];
}
function requestSha(body) {
  return body.match(/codex-review-request:([^\s<]+)/i)?.[1];
}
function addCodeShas(shas, item) {
  const body = bodyOf(item);
  if (!isCodex(item) || isSecurity(body)) return;
  if (body.includes(SUMMARY)) addAbbreviatedSha(shas, summarySha(body));
  addAbbreviatedSha(shas, reviewedSha(body));
}
export function evidenceShas(comments = [], reviews = []) {
  const shas = new Set();
  for (const item of [...comments, ...reviews]) {
    if (isRequest(item)) addAbbreviatedSha(shas, requestSha(bodyOf(item)));
    addCodeShas(shas, item);
  }
  return [...shas];
}
function completion(sha, time, result, resolvedShas) {
  const fullSha = resolveSha(sha, resolvedShas);
  const at = Date.parse(time);
  if (!fullSha || !Number.isFinite(at))
    return unknown('Invalid code-review commit or completion timestamp');
  return { kind: 'complete', sha: fullSha, at, result };
}
function resultFromBody(body) {
  return /didn't find any major issues|no findings|no issues found|no issues detected/i.test(body)
    ? 'clean'
    : 'findings';
}
function completedSummary(cell) {
  return /\*\*Completed\*\*/i.test(
    cell
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
function pendingSummary(cell) {
  return /\b(running|queued|pending|in progress)\b/i.test(
    cell
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
function summaryStatus(cell, sha, resolvedShas) {
  const time = cell.match(/<relative-time\s+datetime="([^"]+)"/i)?.[1];
  if (completedSummary(cell)) return completion(sha, time, 'unknown', resolvedShas);
  if (pendingSummary(cell)) return pendingSummaryActivity(sha, time, resolvedShas);
  return unknown('Unrecognized Code Review status');
}
function pendingSummaryActivity(sha, time, resolvedShas) {
  return {
    kind: 'pending',
    sha: resolveSha(sha, resolvedShas) ?? sha.toLowerCase(),
    at: Date.parse(time),
    reason: `Codex code review is running for ${sha}`,
  };
}
function summaryActivity(body, resolvedShas) {
  const rows = body.split('\n').filter((line) => /\*\*Code Review\*\*/i.test(line));
  if (rows.length !== 1) return unknown('Missing or ambiguous Code Review summary row');
  const match = rows[0].match(
    /\|.*\*\*Code Review\*\*\s*\|\s*([^|]+)\|\s*`([0-9a-f]{7,40})`\s*\|/i
  );
  if (!match) return unknown('Unrecognized Code Review summary row');
  return summaryStatus(match[1], match[2].toLowerCase(), resolvedShas);
}
function commentActivity(comment, resolvedShas) {
  const body = bodyOf(comment);
  if (body.includes(SUMMARY)) return summaryActivity(body, resolvedShas);
  if (!/^Codex Review:/im.test(body))
    return unknown('Unrecognized Codex activity; inspect before requesting');
  const sha = body.match(/\*{0,2}Reviewed commit:\*{0,2}\s*`?([0-9a-f]{7,40})`?/i)?.[1];
  return completion(sha, comment.created_at, resultFromBody(body), resolvedShas);
}
function pendingFormalActivity(review) {
  return {
    kind: 'pending',
    sha: review.commit_id ?? '',
    at: NaN,
    reason: 'Codex formal review is pending',
  };
}
function validFormalReview(review) {
  return FULL_SHA.test(review.commit_id ?? '') && /^#{1,3}\s+.*Codex Review/im.test(bodyOf(review));
}
function formalActivity(review) {
  if (review.state === 'PENDING') return pendingFormalActivity(review);
  if (!validFormalReview(review)) return unknown('Unrecognized Codex formal review');
  return completion(review.commit_id, review.submitted_at, resultFromBody(bodyOf(review)));
}
function collectActivities(comments, reviews, resolvedShas) {
  const codeComments = comments.filter(isCodex).filter((item) => !isSecurity(bodyOf(item)));
  const codeReviews = reviews.filter(isCodex).filter((item) => !isSecurity(bodyOf(item)));
  return [
    ...codeComments.map((item) => commentActivity(item, resolvedShas)),
    ...codeReviews.map(formalActivity),
  ];
}
function isRequest(comment) {
  return (
    REQUEST_ASSOCIATIONS.has(comment.author_association) &&
    !isCodex(comment) &&
    /^@codex[ \t]+review(?:[ \t\r\n]|$)/i.test(bodyOf(comment))
  );
}
function requestRecord(comment, resolvedShas) {
  const reference = requestSha(bodyOf(comment));
  const sha = reference ? resolveSha(reference, resolvedShas) : null;
  return {
    sha,
    tagged: Boolean(reference),
    invalidSha: Boolean(reference) && !sha,
    at: Date.parse(comment.created_at),
    reason: 'A Codex review request has no matching completion',
  };
}
function validIntentSha(intent) {
  return FULL_SHA.test(intent.sha ?? '');
}
function intentTime(intent) {
  return Number.isFinite(intent.requestedAt) ? intent.requestedAt : NaN;
}
function invalidIntentRequestedAt(intent) {
  return intent.requestedAt != null && !Number.isFinite(intent.requestedAt);
}
function intentRecord(intent) {
  const validSha = validIntentSha(intent);
  return {
    sha: validSha ? intent.sha.toLowerCase() : null,
    at: intentTime(intent),
    invalidSha: !validSha,
    invalidRequestedAt: invalidIntentRequestedAt(intent),
    local: true,
    reason: `A prior request intent for ${String(intent.sha).slice(0, 12)} is unresolved`,
  };
}
function requestShaMatches(completed, request, headSha) {
  return request.sha ? request.sha === completed.sha : completed.sha === headSha;
}
function completionIsLater(completed, request) {
  // GitHub timestamps have second precision. Exact-SHA completion at a tied time
  // is reusable; a bot activity still marked running is checked separately.
  return (request.local && !Number.isFinite(request.at)) || completed.at >= request.at;
}
function finishesRequest(completed, request, headSha) {
  if (!requestShaMatches(completed, request, headSha)) return false;
  if (request.kind === 'pending') return completed.at > request.at;
  return completionIsLater(completed, request);
}
function outstanding(requests, completed, headSha) {
  return requests.filter(
    (request) => !completed.some((item) => finishesRequest(item, request, headSha))
  );
}
function blocksCurrent(request, headSha) {
  return !request.sha || request.sha === headSha;
}
function pendingActivity(context) {
  const active = outstanding(
    context.activities.filter((item) => item.kind === 'pending'),
    context.completed,
    context.headSha
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
  if (
    context.requests.some(
      (item) =>
        item.invalidSha || item.invalidRequestedAt || (!item.local && !Number.isFinite(item.at))
    )
  )
    return status('unknown', 'Invalid review request timestamp');
  const item = outstanding(context.requests, context.completed, context.headSha).find((request) =>
    blocksCurrent(request, context.headSha)
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
  const activities = collectActivities(comments, reviews, inputs.resolvedShas);
  const completed = activities.filter((item) => item.kind === 'complete');
  const current = completed.filter((item) => item.sha === headSha).sort((a, b) => b.at - a.at)[0];
  const requests = [
    ...comments.filter(isRequest).map((item) => requestRecord(item, inputs.resolvedShas)),
    ...intents.map(intentRecord),
  ];
  return {
    ...inputs,
    requestedReviewers,
    headSha,
    activities,
    completed,
    current,
    requests,
    now,
    createdAt: Date.parse(inputs.pull.created_at),
  };
}
function decideContext(context) {
  const decisions = [
    pendingActivity,
    requestedReviewer,
    pendingRequest,
    currentCompletion,
    unknownActivity,
    eligiblePull,
  ];
  return decisions.map((decide) => decide(context)).find(Boolean);
}
function invalidContext(context) {
  if (!Number.isFinite(context.createdAt)) return status('unknown', 'PR creation time is invalid');
  if (context.pull.state !== 'open') return status('unknown', 'PR is not open');
  if (context.pull.draft) return status('unknown', 'PR is still a draft');
  return null;
}
function currentHead(pull) {
  return pull.head?.sha?.toLowerCase();
}
export function classifyState(inputs, now = Date.now()) {
  const headSha = currentHead(inputs.pull);
  if (!FULL_SHA.test(headSha)) return status('unknown', 'PR head is missing or invalid');
  const context = buildContext(inputs, now, headSha);
  const invalid = invalidContext(context);
  if (invalid) return invalid;
  const decision = decideContext(context);
  return { ...decision, headSha };
}
