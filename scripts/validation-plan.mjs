import { execFileSync } from 'node:child_process';
import { gitExecutable } from './validation-tools.mjs';
export const fullJobs = [
  'fallow',
  'lint-format',
  'typecheck',
  'test',
  'validate',
  'supabase-db',
  'systems-drift',
  'workers',
];
const reducedJobs = ['lint-format', 'systems-drift'];
// Compatibility window for the integrated security gate: the trusted default-branch aggregate
// accepts a candidate workflow with or without the `security` job. When the job reports, it must
// succeed. The follow-up activation change moves it into the always-selected job set.
export const optionalJobs = ['security'];
// Only Crowdin-owned translations are reduced. app/locales/en.json is the source locale that
// application code and Vitest fixtures consume, so it selects full validation like other inputs
// (scripts/crowdin-pr.sh draws the same boundary for translation-only PRs).
function knownPathCategory(path) {
  if (/^app\/locales\/(?!en\.json$)[^/]+\.json$/.test(path)) return 'locales';
  return /^(?:[^/]+\.md|(?:docs|\.github)\/.+\.(?:md|markdown))$/.test(path) ? 'docs' : 'full';
}
function unsafePath(path) {
  return path.startsWith('/') || path === 'DESIGN.md' || path.split('/').includes('..');
}
function pathCategory(path) {
  if (typeof path !== 'string') return 'full';
  if (unsafePath(path)) return 'full';
  return knownPathCategory(path);
}
function requiresFullValidation(paths, categories, forceFull) {
  return forceFull || paths.length === 0 || categories.has('full');
}
function defaultReason(full) {
  return full ? 'Full validation required' : 'Documentation/translation-only change set';
}
// Workflow linting is selected by path rather than by the full/reduced split: it is only useful
// when automation files change, and an unreadable diff (no paths) must select it conservatively.
function isAutomationPath(path) {
  return typeof path === 'string' && path.startsWith('.github/') && pathCategory(path) === 'full';
}
function touchesWorkflows(paths) {
  return paths.length === 0 || paths.some(isAutomationPath);
}
export function classifyPaths(paths, { forceFull = false, reason } = {}) {
  const categories = new Set(paths.map(pathCategory));
  const full = requiresFullValidation(paths, categories, forceFull);
  return {
    full,
    docs: categories.has('docs'),
    locales: categories.has('locales'),
    i18n: full || categories.has('locales'),
    workflows: touchesWorkflows(paths),
    jobs: [...(full ? fullJobs : reducedJobs)],
    reason: reason || defaultReason(full),
    paths,
  };
}
function assertCompletePaths(paths, count) {
  if (paths.length !== count || paths.some((path) => !path)) throw new Error('Missing Git path');
}
function takeStatusPaths(fields) {
  const status = fields.shift();
  if (!/^(?:[ACDMRTUXB]|[RC]\d+)$/.test(status)) throw new Error('Malformed Git status');
  const count = /^[RC]/.test(status) ? 2 : 1;
  const paths = fields.splice(0, count);
  assertCompletePaths(paths, count);
  return paths;
}
export function parseNameStatus(output) {
  if (!output) return [];
  if (!output.endsWith('\0')) throw new Error('Truncated Git name-status output');
  const fields = output.slice(0, -1).split('\0');
  const paths = [];
  while (fields.length) paths.push(...takeStatusPaths(fields));
  return paths;
}
export function collectChanges({
  base = 'origin/main',
  head = 'HEAD',
  local = true,
  cwd = process.cwd(),
} = {}) {
  const git = (...args) =>
    execFileSync(gitExecutable(), args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    // Resolve refs first so user-supplied revision arguments cannot become Git options.
    const baseSha = git('rev-parse', '--verify', '--end-of-options', `${base}^{commit}`).trim();
    const headSha = git('rev-parse', '--verify', '--end-of-options', `${head}^{commit}`).trim();
    const mergeBase = git('merge-base', baseSha, headSha).trim();
    const paths = parseNameStatus(
      git('diff', '--name-status', '-z', '--find-renames', mergeBase, headSha, '--')
    );
    if (local) {
      paths.push(
        ...parseNameStatus(git('diff', '--name-status', '-z', '--find-renames', '--')),
        ...parseNameStatus(git('diff', '--cached', '--name-status', '-z', '--find-renames', '--')),
        ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
      );
    }
    return { paths: [...new Set(paths)], baseSha, headSha };
  } catch {
    return {
      paths: [],
      error: 'Cannot resolve or read complete Git diff; selecting full validation',
    };
  }
}
function hasPlanShape(plan) {
  return Boolean(plan) && Array.isArray(plan.jobs) && typeof plan.full === 'boolean';
}
function isKnownJob(job) {
  return fullJobs.includes(job) || optionalJobs.includes(job);
}
function isValidPlan(plan) {
  if (!hasPlanShape(plan)) return false;
  const required = plan.full ? fullJobs : reducedJobs;
  return required.every((job) => plan.jobs.includes(job)) && plan.jobs.every(isKnownJob);
}
function jobOutcomeError(plan, needs, job) {
  const expected = plan.jobs.includes(job) ? 'success' : 'skipped';
  const result = needs[job]?.result;
  return result === expected ? null : `${job}: expected ${expected}, received ${String(result)}`;
}
// An optional job may be absent from an older candidate workflow, but a reported outcome other
// than success (failure, cancellation, or a skip) fails the aggregate.
function optionalJobError(needs, job) {
  if (!Object.hasOwn(needs, job)) return null;
  const result = needs[job]?.result;
  return result === 'success' ? null : `${job}: expected success, received ${String(result)}`;
}
// The trusted default-branch aggregator must not silently ignore validation jobs it does not know;
// an unexpected dependency fails closed until the trusted contract is updated first.
function unexpectedJobsError(needs) {
  const unexpected = Object.keys(needs).filter((job) => job !== 'changes' && !isKnownJob(job));
  return unexpected.length ? `Unexpected CI jobs: ${unexpected.join(', ')}` : null;
}
function classifierError(needs) {
  return needs.changes?.result === 'success' ? null : 'Classifier did not succeed';
}
export function aggregateResults(plan, needs) {
  if (!isValidPlan(plan)) return ['Missing or invalid validation plan'];
  return [
    ...fullJobs.map((job) => jobOutcomeError(plan, needs, job)),
    ...optionalJobs.map((job) => optionalJobError(needs, job)),
    classifierError(needs),
    unexpectedJobsError(needs),
  ].filter(Boolean);
}
