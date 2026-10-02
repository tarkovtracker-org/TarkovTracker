import { linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isSecurity } from './codex-review-state.mjs';
const BOT = 'chatgpt-codex-connector[bot]';
const FULL_SHA = /^[0-9a-f]{40}$/;
const associations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const prefix = (repo, pr) => `${repo.replaceAll('/', '_')}-${pr}-`;
const digest = (body) => createHash('sha256').update(body).digest('hex');
function readReceipts(directory, repo, pr) {
  let files;
  try {
    files = readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return files
    .filter((name) => name.startsWith(prefix(repo, pr)) && name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')));
}
function originalRequest(comment) {
  return [
    associations.has(comment.author_association),
    comment.user?.type === 'User',
    /^@codex[ \t]+review[ \t\r\n]*$/i.test(comment.body ?? ''),
  ].every(Boolean);
}
function completedReview(review, sha, requestedAt) {
  const body = review.body ?? '';
  return [
    review.user?.login === BOT,
    review.user?.type === 'Bot',
    review.state !== 'PENDING',
    review.commit_id === sha,
    /^#{1,3}\s+.*Codex Review/im.test(body),
    !isSecurity(body),
    Date.parse(review.submitted_at) >= requestedAt,
  ].every(Boolean);
}
function validateRun(run, context, receipt) {
  const facts = [
    run.id === receipt.runId,
    run.event === 'pull_request',
    run.repository?.full_name?.toLowerCase() === context.repo,
    run.head_repository?.full_name?.toLowerCase() === context.repo,
    run.head_sha === receipt.sha,
    run.pull_requests?.some((pull) => pull.number === context.pr),
    Date.parse(run.created_at) <= Date.parse(receipt.createdAt),
  ];
  if (!facts.every(Boolean))
    throw new Error('Historical request run does not verify the stated PR revision');
}
function validateReceipt(context, inputs, receipt) {
  if (!FULL_SHA.test(receipt.sha ?? '')) throw new Error('Historical request needs a full SHA');
  const command = validateCommand(inputs.comments, receipt);
  validateUneditedCommand(context, command);
  validateCompletion(inputs.reviews, receipt);
  const run = JSON.parse(
    context.runGh(['api', `repos/${context.repo}/actions/runs/${receipt.runId}`])
  );
  validateRun(run, context, receipt);
  return run;
}
function validateCommand(comments, receipt) {
  const comment = comments.find((item) => item.id === receipt.commentId);
  if (!comment) throw new Error('Historical request is missing');
  if (!originalRequest(comment))
    throw new Error('Historical request is edited or not an untagged trusted command');
  const matches = [
    comment.created_at === receipt.createdAt,
    digest(comment.body) === receipt.bodyHash,
  ];
  if (!matches.every(Boolean))
    throw new Error('Historical request no longer matches its disposition receipt');
  return comment;
}
function validateUneditedCommand(context, command) {
  if (!command.node_id) throw new Error('Historical request has no GitHub node identity');
  const query = 'query($id:ID!){node(id:$id){... on IssueComment{id body createdAt lastEditedAt}}}';
  const response = JSON.parse(
    context.runGh(['api', 'graphql', '-f', `query=${query}`, '-f', `id=${command.node_id}`])
  );
  const node = response.data?.node ?? {};
  const matches = [
    node.id === command.node_id,
    node.body === command.body,
    node.createdAt === command.created_at,
    node.lastEditedAt === null,
  ];
  if (!matches.every(Boolean))
    throw new Error('Historical request is edited or its live edit metadata is unavailable');
}
function validateCompletion(reviews, receipt) {
  if (
    !reviews.some((review) => completedReview(review, receipt.sha, Date.parse(receipt.createdAt)))
  )
    throw new Error(
      'Historical request has no authenticated later exact-SHA formal code-review completion'
    );
}
function verifyInterval(context, receipt, run) {
  const endpoint = `repos/${context.repo}/actions/runs?event=pull_request&created=${encodeURIComponent(`${run.created_at}..${receipt.createdAt}`)}&per_page=100`;
  const pages = JSON.parse(context.runGh(['api', '--paginate', '--slurp', endpoint]));
  const differentHead = pages
    .flatMap((page) => page.workflow_runs ?? [])
    .some((item) => item.head_sha !== receipt.sha && mayBelongToPull(item, context.pr));
  if (differentHead)
    throw new Error(
      'Historical request revision is ambiguous: another PR head was observed before the request'
    );
}
function mayBelongToPull(run, pr) {
  if (!Array.isArray(run.pull_requests)) return true;
  return run.pull_requests.length === 0 || run.pull_requests.some((pull) => pull.number === pr);
}
function newReceipt(context, inputs) {
  const comment = inputs.comments.find((item) => item.id === context.retireRequest);
  if (!comment) throw new Error('Historical review request was not found');
  const receipt = {
    commentId: comment.id,
    sha: context.requestSha,
    runId: context.evidenceRun,
    createdAt: comment.created_at,
    bodyHash: digest(comment.body),
  };
  const run = validateReceipt(context, inputs, receipt);
  verifyInterval(context, receipt, run);
  return receipt;
}
/** Publish complete JSON atomically without replacing any existing receipt. */
export function publishReceipt(path, receipt) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(receipt)}\n`, { flag: 'wx', mode: 0o600 });
    linkSync(temporary, path);
  } finally {
    removeTemporary(temporary);
  }
}
function removeTemporary(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
/** Explicit historical disposition never establishes review completion for a new head. */
export function applyRequestDispositions(context, inputs) {
  const directory = join(context.stateDirectory, 'dispositions');
  const receipts = readReceipts(directory, context.repo, context.pr);
  for (const receipt of receipts) {
    const run = validateReceipt(context, inputs, receipt);
    verifyInterval(context, receipt, run);
  }
  if (
    context.retireRequest &&
    !receipts.some((receipt) => receipt.commentId === context.retireRequest)
  ) {
    const receipt = newReceipt(context, inputs);
    mkdirSync(directory, { recursive: true });
    publishReceipt(
      join(directory, `${prefix(context.repo, context.pr)}${receipt.commentId}.json`),
      receipt
    );
    receipts.push(receipt);
  }
  return {
    ...inputs,
    comments: inputs.comments.map((comment) => {
      const receipt = receipts.find((item) => item.commentId === comment.id);
      return receipt
        ? { ...comment, body: `${comment.body}\n<!-- codex-review-request:${receipt.sha} -->` }
        : comment;
    }),
  };
}
