import {
  DAY_MS,
  dependencyFingerprint,
  evidenceDates,
  githubPages,
  remoteDependencies,
  reviewedComposition,
  requireEvidence,
} from './dependency-evidence.mjs';
const SOCKET_APP_ID = 156372;
const NAMES = ['Socket Security: Project Report', 'Socket Security: Pull Request Alerts'];
const socketApp = (run) =>
  [run.app?.id === SOCKET_APP_ID, run.app?.slug === 'socket-security'].every(Boolean);
export function latestSocketChecks(checks) {
  return NAMES.map(
    (name) =>
      checks
        .filter((run) => [run.name === name, socketApp(run)].every(Boolean))
        .sort((a, b) => b.id - a.id)[0]
  );
}
const outputOf = (run) =>
  Object.fromEntries(['title', 'summary', 'text'].map((key) => [key, run.output?.[key] ?? '']));
/** Unknown report formats fail closed, including a success status with warnings we cannot parse. */
export function socketWarnings(run) {
  const { summary, text, title } = outputOf(run);
  const count = summary.match(/Found (\d+) (?:project |new )?alerts?/i);
  if (!count) {
    requireEvidence(
      !/warn|alert.*(?:⚠️|🚨)/iu.test(`${title} ${summary} ${text}`),
      'Unrecognized Socket warning report'
    );
    requireEvidence(
      /no (?:new |project )?(?:dependency )?(?:issues|alerts)|(?:0|zero) (?:new |project )?alerts/i.test(
        summary
      ),
      'Socket report contains no explicit clean verdict'
    );
    requireEvidence(!text?.trim(), 'Unrecognized content in clean Socket report');
    return [];
  }
  if (Number(count[1]) === 0) {
    requireEvidence(
      [!text?.trim(), !/warn|⚠️|🚨/iu.test(title)].every(Boolean),
      'Unrecognized content in zero-alert Socket report'
    );
  }
  const rows = [...text.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)];
  requireEvidence(
    rows.length === Number(count[1]),
    'Socket alert count does not match published details'
  );
  return rows.map(([, detail]) => {
    const type = detail.match(/<summary>\s*<strong>([^<]+)<\/strong>/i)?.[1];
    const match = detail.match(
      /https:\/\/socket\.dev\/npm\/package\/([^"?]+)\/overview\/(\d+\.\d+\.\d+(?:-[\w.-]+)?)/i
    );
    requireEvidence(type && match, 'Unrecognized Socket alert identity');
    return { type, package: `${decodeURIComponent(match[1])}@${match[2]}` };
  });
}
function requireCompletedCheck(check, head, now) {
  requireEvidence(check, 'Missing exact-revision Socket report');
  requireEvidence(check.head_sha === head, 'Missing exact-revision Socket report');
  requireEvidence(
    [check.status === 'completed', check.conclusion === 'success'].every(Boolean),
    'Socket scan is incomplete or blocking'
  );
  const completed = Date.parse(check.completed_at);
  requireEvidence(
    [completed <= now, now - completed <= 7 * DAY_MS].every(Boolean),
    'Socket scan is stale or undated'
  );
}
function projectWarnings(check) {
  const output = outputOf(check);
  requireEvidence(
    /https:\/\/socket\.dev\/dashboard\//.test(output.summary),
    'Socket project report link is missing'
  );
  if (/warn|Found \d+ .*alerts?/i.test(`${output.title} ${output.summary} ${output.text}`))
    return socketWarnings(check);
  requireEvidence(
    [
      output.title === 'Project Report: Success',
      !output.text?.trim(),
      /^\|Report\|Status\|Message\|\n\|---\|---\|---\|\n\|Project report\|✅\|\[View full report\]\(https:\/\/socket\.dev\/dashboard\/org\/[\w-]+\/sbom\/[a-f0-9-]+\)\|\n\nClick through to the see the full socket security project report page for this commit to see information about every dependency in this project\.$/.test(
        output.summary
      ),
    ].every(Boolean),
    'Unrecognized Socket project report schema'
  );
  return [];
}
function requireWarningReview(warning, triage, now) {
  const review = triage.find((entry) =>
    [entry.package === warning.package, entry.type === warning.type].every(Boolean)
  );
  requireEvidence(
    warning.type === 'Low adoption',
    `Socket ${warning.type} requires remediation or upstream Socket triage`
  );
  requireEvidence(
    [evidenceDates(review, now), review?.reason?.trim().length >= 80].every(Boolean),
    `Unreviewed Socket warning: ${warning.package} ${warning.type}`
  );
}
export function evaluateSocket(checks, head, triage, now = Date.now()) {
  const selected = latestSocketChecks(checks);
  selected.forEach((check) => requireCompletedCheck(check, head, now));
  const warnings = [...projectWarnings(selected[0]), ...socketWarnings(selected[1])];
  warnings.forEach((warning) => requireWarningReview(warning, triage, now));
  return warnings;
}
export async function verifySocket(
  repository,
  head,
  fingerprint,
  reviews,
  now = Date.now(),
  composition
) {
  const scanned = await remoteDependencies(repository, head);
  const identical = dependencyFingerprint(scanned.manifest, scanned.lock) === fingerprint;
  if (!identical) {
    requireEvidence(composition, 'Socket scan does not cover this dependency graph');
    const baseRevision = composition.resolveBase
      ? await composition.resolveBase()
      : composition.base;
    const base = await remoteDependencies(repository, baseRevision);
    requireEvidence(
      reviewedComposition(composition.candidate, base, scanned),
      'Queue introduced an artifact, patch or dependency declaration outside trusted-base and Socket-reviewed inputs'
    );
  }
  const checks = await githubPages(`repos/${repository}/commits/${head}/check-runs`, 'check_runs');
  return evaluateSocket(checks, head, reviews, now);
}
