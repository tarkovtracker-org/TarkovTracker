import {
  codeRabbitCommentReview,
  codeRabbitOutstandingFindings,
} from './review-admission-coderabbit.mjs';
// This policy is loaded from trusted main, never from a candidate checkout.
export const CONTEXT = 'Review Admission';
export const SHA = /^[0-9a-f]{40}$/;
export const CROWDIN_REPOSITORY = Object.freeze({
  full_name: 'tarkovtracker-org/TarkovTracker',
  id: 1098874862,
});
export function isCrowdinRepository(repository) {
  return [
    repository?.full_name === CROWDIN_REPOSITORY.full_name,
    repository?.id === CROWDIN_REPOSITORY.id,
  ].every(Boolean);
}
// Deliberately pinned: new locale codes require an explicit review of exemption scope.
const CROWDIN_TRANSLATIONS = new Set(
  ['cs', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'uk', 'zh'].map(
    (code) => `app/locales/${code}.json`
  )
);
function translationFile(file) {
  return [
    CROWDIN_TRANSLATIONS.has(file.filename),
    ['added', 'modified'].includes(file.status),
    !file.previous_filename,
    SHA.test(file.sha ?? ''),
  ].every(Boolean);
}
function completeFiles(pr, files) {
  if (!Array.isArray(files)) return false;
  return [
    files.length > 0,
    files.length <= 300,
    files.length === pr.changed_files,
    new Set(files.map((file) => file.filename)).size === files.length,
    files.every(translationFile),
  ].every(Boolean);
}
function sourceBranch(branch, ref) {
  if (!branch) return false;
  return [isCrowdinRepository(branch.repo), branch.ref === ref, SHA.test(branch.sha)].every(
    Boolean
  );
}
function botAuthor(user) {
  if (!user) return false;
  return [user.id === 41898282, user.type === 'Bot', user.login === 'github-actions[bot]'].every(
    Boolean
  );
}
/** Bot names, titles and labels alone never select the exemption. */
export function crowdinCandidate(pr, files) {
  return [
    pr.state === 'open',
    pr.draft === false,
    botAuthor(pr.user),
    sourceBranch(pr.head, 'locales'),
    sourceBranch(pr.base, 'main'),
    completeFiles(pr, files),
  ].every(Boolean);
}
export const INDEPENDENT_REVIEW_REQUIRED = 'Completed exact-head independent review is required.';
const PROVIDERS = Object.freeze([
  {
    name: 'CodeRabbit',
    botId: 136622811,
    appId: 347564,
    summary: /\*\*Actionable comments posted: \d+\*\*/,
  },
  {
    name: 'Cubic',
    botId: 191113872,
    appId: 1082092,
    summary: /<!-- cubic:review-summary:start -->[\s\S]+<!-- cubic:review-summary:end -->/,
  },
]);
class AdmissionDenied extends Error {}
export class AdmissionPending extends Error {}
// An expected policy hold (draft or closed PR, missing review, open findings, missing sensitive approval).
// It still denies and fails the published status; only the controller run itself may succeed.
export class AdmissionHeld extends AdmissionDenied {}
export function requireEvidence(condition, message) {
  if (!condition) throw new AdmissionDenied(message);
}
function requirePolicy(condition, message) {
  if (!condition) throw new AdmissionHeld(message);
}
const SENSITIVE_PATH =
  /(?:^supabase\/|^workers\/|^shared\/|^scripts\/(?:ops|precompute|release|codex-review|preview|ci)\/|^\.github\/|(?:^|\/)(?:AGENTS|CLAUDE|SECURITY|code_review)\.md$|^docs\/(?:code-review|workflow-automation)\.md$|(?:auth|session|permission|supabase|billing|stripe|token|credential|entitlement|migration|contract|wrangler|nuxt\.config|progressState|progress-storage|useProgress|useTarkov|storage|persist|team|account)(?:[./_-]|[A-Z]|$))/i;
const LOW_RISK_PATH =
  /^(?:docs\/|[^/]+\.md$|app\/locales\/|app\/(?:components|pages|features|layouts|assets)\/|(?:app|scripts)\/.*(?:\.test\.[cm]?[jt]s|\.spec\.[cm]?[jt]s)$|scripts\/workflow-tests\/)/;
const SENSITIVE_PATCH =
  /(?:supabase|stripe|service.role|secret|credential|authorization|authentication|permission|access.check|session|process\.env|runtimeConfig|localStorage|indexedDB|persist|defineEventHandler|fetch\b|sendBeacon|XMLHttpRequest|WebSocket|EventSource|useFetch|useLazyFetch|https?:\/\/)/i;
const REVIEW_ONLY_PATH =
  /^(?:docs\/|[^/]+\.md$|app\/locales\/)|(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]s$|^scripts\/workflow-tests\//;
function ordinaryFile(file) {
  if (SENSITIVE_PATH.test(file.filename)) return false;
  if (!LOW_RISK_PATH.test(file.filename)) return false;
  return ordinaryPatch(file);
}
function ordinaryPatch(file) {
  if (!file.patch) return false;
  if (/^(?:docs\/|app\/locales\/|[^/]+\.md$)/.test(file.filename)) return true;
  // Context can contain the capability whose arguments or guards changed. Diff-looking
  // prefixes are also valid source content, so scan the complete supplied hunk.
  return !SENSITIVE_PATCH.test(file.patch);
}
export function classifyRisk(files, metadataSafe = false) {
  requireEvidence(Array.isArray(files), 'Changed files must be a list.');
  requireEvidence(files.length > 0, 'Complete changed files are required.');
  if (metadataSafe && files.every(safeMetadataFile))
    return { sensitive: false, paths: files.map((file) => file.filename) };
  const names = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
  const sensitive = files.some((file) => !ordinaryFile(file));
  const renamedSensitive = names.some((name) => SENSITIVE_PATH.test(name));
  const large = largeRuntimeDiff(files);
  return { sensitive: [sensitive, renamedSensitive, large].some(Boolean), paths: names };
}
function safeMetadataFile(file) {
  return [
    file.status === 'modified',
    !file.previous_filename,
    ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'].includes(file.filename),
  ].every(Boolean);
}
function largeRuntimeDiff(files) {
  const runtime = files.filter((file) => !REVIEW_ONLY_PATH.test(file.filename));
  return runtime.reduce((sum, file) => sum + file.changes, 0) > 500;
}
function latestReviews(reviews) {
  const latest = new Map();
  for (const review of reviews) keepLatestReview(latest, review);
  return [...latest.values()];
}
function keepLatestReview(latest, review) {
  if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) return;
  if (!review.user?.id) return keepAnonymousRequest(latest, review);
  keepLatestUserReview(latest, review);
}
function keepAnonymousRequest(latest, review) {
  if (review.state === 'CHANGES_REQUESTED') latest.set(review, review);
}
function keepLatestUserReview(latest, review) {
  const old = latest.get(review.user.id);
  if (!old || review.id > old.id) latest.set(review.user.id, review);
}
function providerReview(review, provider, head) {
  return [
    review.user?.id === provider.botId,
    review.user?.type === 'Bot',
    review.commit_id === head,
    ['APPROVED', 'COMMENTED'].includes(review.state),
    Boolean(review.submitted_at),
    provider.summary.test(review.body ?? ''),
  ].every(Boolean);
}
function providerChecks(checks, provider, head) {
  const own = checks.filter((check) => check.app?.id === provider.appId);
  return own.every((check) =>
    [
      check.head_sha === head,
      check.status === 'completed',
      ['success', 'neutral'].includes(check.conclusion),
    ].every(Boolean)
  );
}
function cleanCubicSummary(body) {
  const summaries = [
    ...body.matchAll(
      /<!-- cubic:review-summary:start -->([\s\S]*?)<!-- cubic:review-summary:end -->/g
    ),
  ];
  if (summaries.length !== 1) return false;
  const summary = summaries[0][1]
    .trim()
    .replace(/^<!-- cubic:review-summary:confidence-score:[0-5]\/5 -->\s*/, '');
  const overall = summary.split('\n')[0].trim();
  const clean =
    /^\*\*(?:No issues found|0 issues found|All reported issues were addressed)(?:\*\*(?: across [1-9]\d* files?)?| across [1-9]\d* files?(?: \(changes from recent commits\))?\.?\*\*)$/;
  return [
    clean.test(overall),
    !/\b[1-9]\d* issues? found\b/i.test(body),
    !/^\s*(?:[-*]\s*)?(?:>\s*)?(?:\*\*)?Review skipped\b/im.test(body),
    !/^\s*(?:[-*]\s*)?>\s*\*\*(?:No issues found|0 issues found|All reported issues were addressed)\b/im.test(
      body
    ),
  ].every(Boolean);
}
function zeroOutsideFindings(review, provider) {
  if (provider.name === 'Cubic') return cleanCubicSummary(review.body ?? '');
  // Findings outside the diff have no resolvable GitHub thread; require a clean re-review.
  return /Actionable comments posted: 0\*\*/.test(review.body ?? '');
}
function completedProvider(reviews, checks, head, provider) {
  const review = reviews.findLast((item) => providerReview(item, provider, head));
  if (!review) return null;
  if (
    ![providerChecks(checks, provider, head), zeroOutsideFindings(review, provider)].every(Boolean)
  )
    return null;
  return { provider: provider.name, reviewId: review.id, commit: head };
}
function verifiedProvider(reviews, checks, head, comments) {
  const review = PROVIDERS.map((provider) =>
    completedProvider(reviews, checks, head, provider)
  ).find(Boolean);
  if (review) return review;
  const provider = PROVIDERS[0];
  if (!providerChecks(checks, provider, head)) return null;
  if (conflictingCodeRabbitReview(reviews, head, provider)) return null;
  return codeRabbitCommentReview(comments, head);
}
function conflictingCodeRabbitReview(reviews, head, provider) {
  return reviews.some((review) =>
    [
      review.user?.id === provider.botId,
      review.user?.type === 'Bot',
      review.commit_id === head,
      Boolean(review.body?.trim()),
      !zeroOutsideFindings(review, provider),
    ].every(Boolean)
  );
}
function approvedHuman(review, head, authorId, trusted) {
  if (!review.user) return false;
  return [
    review.state === 'APPROVED',
    review.commit_id === head,
    review.user.type === 'User',
    review.user.id !== authorId,
    trusted.has(review.user.login),
  ].every(Boolean);
}
function explicitComment(comment, head, trusted) {
  if (!comment.user) return false;
  return [
    comment.user.type === 'User',
    trusted.has(comment.user.login),
    [`/approve ${head}`, `/approve-sensitive ${head}`].includes(comment.body.trim()),
    !comment.body.includes('\n'),
  ].every(Boolean);
}
function requireReady(pr) {
  requireEvidence(SHA.test(pr.head.sha), 'PR head must be immutable.');
  requirePolicy(pr.state === 'open' && !pr.draft, 'PR must be open and ready.');
}
function requireFindingsResolved(threads, reviews) {
  requirePolicy(
    !threads.some((thread) => !thread.isResolved && !thread.isOutdated),
    'Unresolved review findings remain.'
  );
  requirePolicy(
    !reviews.some((review) => review.state === 'CHANGES_REQUESTED'),
    'Changes requested remain.'
  );
}
function requireSensitiveApproval(sensitive, human, approval) {
  if (!sensitive) return;
  requirePolicy(
    Boolean(human || approval),
    'Sensitive or unclassified change needs exact-head collaborator approval.'
  );
}
function approvalId(human, approval) {
  if (human) return human.id;
  return approval?.id ?? null;
}
function reviewedHead(input, latest) {
  const { pr, checks, trusted, reviews } = input;
  requireCrowdinFindingsResolved(input);
  const human = latest.find((review) => approvedHuman(review, pr.head.sha, pr.user.id, trusted));
  const provider =
    verifiedProvider(reviews, checks, pr.head.sha, input.comments) ?? exemptProvider(input);
  requirePolicy(
    Boolean(provider || human || adminReview(input.adminAttestation, pr.head.sha)),
    reviewRequirement(input)
  );
  return { human, provider };
}
function reviewRequirement(input) {
  return crowdinCandidate(input.pr, input.files)
    ? 'Trusted Crowdin validation for this exact head is required; rerun Crowdin Sync on main.'
    : INDEPENDENT_REVIEW_REQUIRED;
}
function outstandingProviderFinding(review, head) {
  const provider = PROVIDERS.find((item) => item.botId === review.user?.id);
  if (!provider) return false;
  return [
    review.user.type === 'Bot',
    review.commit_id === head,
    Boolean(review.submitted_at),
    ['APPROVED', 'COMMENTED'].includes(review.state),
    /(?:Actionable comments posted|Outside diff range comments)\s*[:(]\s*\*{0,2}0*[1-9]\d*|\b0*[1-9]\d* (?:issues?|findings?) (?:found|remain)\b/i.test(
      review.body ?? ''
    ),
  ].every(Boolean);
}
function currentCrowdinProof(proof, head) {
  if (!proof) return false;
  return [
    proof.commit === head,
    proof.provider === 'crowdin-policy',
    proof.kind === 'review-exempt',
  ].every(Boolean);
}
function crowdinExemption(input) {
  if (!crowdinCandidate(input.pr, input.files)) return null;
  const proof = input.crowdinSafe;
  if (!currentCrowdinProof(proof, input.pr.head.sha)) return null;
  return proof;
}
/**
 * Generated release version PRs change only the manifest version and CHANGELOG, authored by
 * GitHub Actions on a canonical `wip/release-*` branch (review-admission-release.mjs). No review
 * provider covers them, so they are exempt; threads, changes requested and queue proof still apply.
 */
function exemptProvider(input) {
  return crowdinExemption(input) ?? releaseExemption(input);
}
function releaseExemption(input) {
  if (!input.releaseSafe) return null;
  return { provider: 'release-policy', kind: 'review-exempt', commit: input.pr.head.sha };
}
function latestCleanProviderReview(reviews, checks, head, provider) {
  if (!providerChecks(checks, provider, head)) return null;
  return reviews.findLast((review) =>
    [providerReview(review, provider, head), zeroOutsideFindings(review, provider)].every(Boolean)
  );
}
function providerStillHasFindings(input, provider) {
  const own = input.reviews
    .filter((review) => review.user?.id === provider.botId)
    .toSorted((a, b) => a.id - b.id);
  const finding = own.findLast((review) => outstandingProviderFinding(review, input.pr.head.sha));
  if (!finding) return false;
  const clean = latestCleanProviderReview(own, input.checks, input.pr.head.sha, provider);
  return !clean || clean.id <= finding.id;
}
function requireCrowdinFindingsResolved(input) {
  if (!crowdinCandidate(input.pr, input.files)) return;
  requirePolicy(
    !PROVIDERS.some((provider) => providerStillHasFindings(input, provider)),
    'Substantive provider findings remain.'
  );
  requirePolicy(
    !codeRabbitOutstandingFindings(input.comments, input.pr.head.sha),
    'Substantive provider findings remain.'
  );
}
function positiveReviewId(value) {
  return [Number.isSafeInteger(value), value > 0].every(Boolean);
}
function adminReview(review, head) {
  if (!review) return null;
  return [
    review.provider === 'admin-attestation',
    review.commit === head,
    positiveReviewId(review.actorId),
    positiveReviewId(review.reviewId),
  ].every(Boolean)
    ? review
    : null;
}
function humanReview(human, head) {
  return human ? { provider: 'human', reviewId: human.id, commit: head } : null;
}
export function admissionDecision(input) {
  const { pr, files, threads, comments, trusted, reviews } = input;
  requireReady(pr);
  const latest = latestReviews(reviews);
  requireFindingsResolved(threads, latest);
  const { human, provider } = reviewedHead(input, latest);
  const risk = classifyRisk(files, [input.dependencySafe, input.releaseSafe].some(Boolean));
  const approval = comments.findLast((comment) => explicitComment(comment, pr.head.sha, trusted));
  requireSensitiveApproval(risk.sensitive, human, approval);
  return {
    approved: true,
    risk: risk.sensitive ? 'sensitive' : 'low',
    review: provider ?? humanReview(human, pr.head.sha) ?? input.adminAttestation,
    sensitiveApprovalId: approvalId(human, approval),
  };
}
