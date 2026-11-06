// GitHub-authenticated issue comments, not PR text or an Actions status, own this evidence.
const BOT_ID = 136622811;
function providerIdentity(user = {}) {
  return [user?.id === BOT_ID, user?.type === 'Bot', user?.login === 'coderabbitai[bot]'].every(
    Boolean
  );
}
function reviewMarkers(body) {
  return (
    typeof body === 'string' &&
    /<!-- (?:recent_review_start|final_review_risk_coverage:)/.test(body)
  );
}
export function codeRabbitCommentEvent(payload) {
  const { comment = {}, changes = {} } = payload;
  return providerIdentity(comment.user) && [comment.body, changes.body?.from].some(reviewMarkers);
}
const COMMENT_SNAPSHOT = `query($id: ID!) {
  node(id: $id) { __typename ... on IssueComment {
    id fullDatabaseId body createdAt updatedAt lastEditedAt
    author { __typename login ... on Bot { databaseId } }
    editor { __typename login ... on Bot { databaseId } }
  } }
}`;
// REST is only a locator. The evaluated body, author, and editor come from one GraphQL response.
export async function readCodeRabbitComments(github, comments) {
  return Promise.all(
    comments.map((comment) =>
      providerIdentity(comment.user) && reviewMarkers(comment.body)
        ? commentSnapshot(github, comment)
        : comment
    )
  );
}
async function commentSnapshot(github, comment) {
  const response = await github.graphql(COMMENT_SNAPSHOT, { id: comment.node_id });
  const node = response.node ?? {};
  if (
    ![
      node.__typename === 'IssueComment',
      node.id === comment.node_id,
      sameCommentId(node.fullDatabaseId, comment.id),
    ].every(Boolean)
  )
    throw new Error('CodeRabbit comment snapshot identity is missing or changed.');
  return snapshotComment(node, comment.id);
}
function sameCommentId(fullId, restId) {
  return [
    Number.isSafeInteger(restId),
    restId > 0,
    typeof fullId === 'string',
    fullId === String(restId),
  ].every(Boolean);
}
function snapshotComment(node, restId) {
  return {
    id: restId,
    node_id: node.id,
    user: {
      id: node.author?.databaseId,
      type: node.author?.__typename,
      login: `${node.author?.login}[bot]`,
    },
    body: node.body,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    lastEditedAt: node.lastEditedAt,
    editor: node.editor,
  };
}
function editProvenance(comment) {
  if (comment.lastEditedAt === null) return comment.editor === null;
  const edited = Date.parse(comment.lastEditedAt);
  return [
    Number.isFinite(edited),
    graphProviderIdentity(comment.editor),
    edited >= Date.parse(comment.created_at),
    edited <= Date.parse(comment.updated_at),
  ].every(Boolean);
}
function graphProviderIdentity(actor = {}) {
  return [
    actor?.databaseId === BOT_ID,
    actor?.__typename === 'Bot',
    actor?.login === 'coderabbitai',
  ].every(Boolean);
}
function authenticated(comment) {
  return [
    providerIdentity(comment.user),
    editProvenance(comment),
    typeof comment.node_id === 'string',
    Number.isSafeInteger(comment.id) && comment.id > 0,
    Number.isFinite(Date.parse(comment.created_at)),
    Number.isFinite(Date.parse(comment.updated_at)),
    Date.parse(comment.updated_at) >= Date.parse(comment.created_at),
    typeof comment.body === 'string',
  ].every(Boolean);
}
function uniqueSection(body, name) {
  const start = `<!-- ${name}_start -->`;
  const end = `<!-- ${name}_end -->`;
  if (![start, end].every((marker) => body.split(marker).length === 2)) return null;
  const expression = new RegExp(`^${start}\\r?\\n([\\s\\S]*?)^${end}$`, 'm');
  return expression.exec(body)?.[1] ?? null;
}
function withoutCode(body) {
  return body
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t\r]*$/gm, '')
    .replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*$/m, '');
}
function exactCoverage(body, head) {
  if (body.split('<!-- final_review_risk_coverage:').length !== 2) return false;
  // Deliberately accept only the observed schema, including unique fields and reviewed kind.
  const marker =
    /^<!-- final_review_risk_coverage:\{"sourceCommitId":"([a-f0-9]{40})","coveredCommitId":"([a-f0-9]{40})","kind":"reviewed"\} -->$/m;
  const [, source, covered] = marker.exec(body) ?? [];
  return [source === head, covered === head].every(Boolean);
}
function noConflicts(body) {
  return ![
    /<!-- review_in_progress_start -->/,
    /(?:Actionable comments posted|Outside diff range comments)\s*[:(]\s*\*{0,2}0*[1-9]\d*/i,
    /\b0*[1-9]\d* (?:actionable )?(?:issues?|findings?) (?:found|remain)\b/i,
    /^\s*(?:[-*>]\s*)?(?:\*\*)?(?:Review skipped|Review incomplete|Review failed|Review in progress|Review is in progress|Rate limit exceeded)\b/im,
  ].some((pattern) => pattern.test(body));
}
function minimalRisk(body) {
  if (body.split('**Merge Risk:**').length !== 2) return false;
  return /^\*\*Merge Risk:\*\* \*\*⚪ Minimal\*\* · up to `[a-f0-9]{5}`$/m.test(body);
}
function consistentRisk(body) {
  return (body.match(/Merge Risk:[^\n]*/g) ?? []).every(
    (statement) =>
      /\bMinimal\b/.test(statement) && !/\b(?:High|Medium|Low|Critical|Unknown)\b/i.test(statement)
  );
}
function completed(body, head) {
  const text = withoutCode(body);
  const recent = uniqueSection(text, 'recent_review');
  const risk = uniqueSection(text, 'final_review_risk');
  return [
    recent
      ?.trimStart()
      .startsWith('No actionable comments were generated in the recent review. 🎉\n'),
    body.split('**Merge Risk:**').length === 2,
    consistentRisk(body),
    minimalRisk(risk ?? ''),
    exactCoverage(body, head),
    exactCoverage(risk ?? '', head),
    noConflicts(body),
  ].every(Boolean);
}
export function codeRabbitCommentReview(comments, head) {
  const candidates = comments.filter(
    (comment) => authenticated(comment) && reviewMarkers(comment.body)
  );
  if (candidates.length !== 1) return null;
  const comment = candidates[0];
  if (!completed(comment.body.replaceAll('\r\n', '\n'), head)) return null;
  return { provider: 'CodeRabbit', reviewId: comment.id, commit: head, kind: 'issue-comment' };
}
// A Crowdin exemption removes the requirement to request review, never existing findings.
export function codeRabbitOutstandingFindings(comments, head) {
  return comments.some((comment) =>
    [
      authenticated(comment),
      exactCoverage(comment.body ?? '', head),
      /(?:Actionable comments posted|Outside diff range comments)\s*[:(]\s*\*{0,2}0*[1-9]\d*|\b0*[1-9]\d* (?:actionable )?(?:issues?|findings?) (?:found|remain)\b/i.test(
        comment.body ?? ''
      ),
    ].every(Boolean)
  );
}
