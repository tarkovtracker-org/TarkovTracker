import { execFileSync } from 'node:child_process';
import { formatterOnlyChange, formatterPaths } from './formatter-validation.mjs';
import { gitExecutable } from './validation-tools.mjs';
// `security` (dependency audit, Gitleaks, CodeQL through the reusable workflow) reports on every
// CI run: pull requests, main pushes, and explicit dispatches all gate on it.
export const fullJobs = [
  'fallow',
  'lint-format',
  'typecheck',
  'test',
  'coverage',
  'validate',
  'supabase-db',
  'systems-drift',
  'workers',
  'security',
];
const reducedJobs = ['lint-format', 'systems-drift', 'security'];
// Agent instruction files (root or nested AGENTS.md/CLAUDE.md) are
// documentation. Under `public/` they would ship as site assets, so they stay full.
function agentInstructionPath(path) {
  return /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/.test(path) && !path.startsWith('public/');
}
function docsPath(path) {
  return (
    /^(?:[^/]+\.md|(?:docs|\.github)\/.+\.(?:md|markdown))$/.test(path) ||
    agentInstructionPath(path)
  );
}
// Only Crowdin-owned translations are reduced. app/locales/en.json is the source locale that
// application code and Vitest fixtures consume, so it selects full validation like other inputs
// (scripts/ci/crowdin-pr.sh draws the same boundary for translation-only PRs).
function knownPathCategory(path) {
  if (/^app\/locales\/(?!en\.json$)[^/]+\.json$/.test(path)) return 'locales';
  return docsPath(path) ? 'docs' : 'full';
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
// The preview decision is independent of the full/reduced test split: it asks whether the change
// can reach what Cloudflare Pages serves. Documentation, non-deployment configuration, repository tooling,
// and tests are never build inputs (`pnpm run build` is only `nuxt build`, and `nuxt.config.ts`
// imports nothing from these locations), so a change set made only of them needs no deployable
// preview; the controller then publishes `Preview Result: success` as not applicable instead of
// requiring a deployment. Build setup and deployment workflows stay preview-required too.
// The preview pipeline under `scripts/preview/` is also never inert:
// the candidate's profile and manifest steps run inside `Validate`, so deploying the candidate is
// what proves that path end to end. Everything else requires one: the app, `public/`, `shared/`,
// Supabase, Workers, build and dependency configuration, Markdown under `public/`, any unknown
// path, forced full runs, and unreadable diffs. Keep this list in sync with the build graph — when
// the build starts consuming one of these locations, remove it from `inertPrefixes`/
// `inertRootFiles`, or add it to `deployablePath`, in the same change.
const inertPrefixes = ['.cubic/', '.github/', '.husky/', '.vscode/', 'docs/', 'scripts/', 'tests/'];
const inertRootFiles = new Set([
  '.coderabbit.yaml',
  '.fallowrc.json',
  '.gitignore',
  '.markdownlint.json',
  '.markdownlintignore',
  '.prettierignore',
  '.prettierrc',
  '.releaserc.json',
  'commitlint.config.js',
  'eslint.config.mjs',
  'socket.yml',
  'vitest.config.ts',
]);
/** Never inert: `public/` is what Pages serves, and the preview pipeline produces the artifact
 * a deployment verifies — its candidate-side profile and manifest steps run inside `Validate`. */
function deployablePath(path) {
  const prefixes = ['public/', 'scripts/preview/', 'scripts/setup/', '.github/actions/'];
  return prefixes.some((prefix) => path.startsWith(prefix)) || deploymentWorkflowPath(path);
}
function deploymentWorkflowPath(path) {
  if (!path.startsWith('.github/workflows/') || markdownPath(path)) return false;
  // Crowdin synchronizes locale PRs; it does not build or deploy Pages. Every other workflow,
  // including new/unknown workflow files, stays conservative rather than exempting all YAML.
  return path !== '.github/workflows/crowdin.yml';
}
function markdownPath(path) {
  return /\.(?:md|markdown)$/i.test(path);
}
function inertLocation(path) {
  if (inertPrefixes.some((prefix) => path.startsWith(prefix))) return true;
  return inertRootFiles.has(path);
}
function inertContent(path) {
  // Markdown is read by humans and agents; nothing in the build graph loads it.
  if (markdownPath(path)) return true;
  return inertLocation(path);
}
function inertPath(path) {
  if (typeof path !== 'string' || unsafePath(path)) return false;
  if (deployablePath(path)) return false;
  return inertContent(path);
}
function requiresPreview(paths, forceFull) {
  if (forceFull || paths.length === 0) return true;
  return !paths.every(inertPath);
}
export function classifyPaths(paths, { forceFull = false, reason, formatterOnly = false } = {}) {
  const categories = new Set(paths.map(pathCategory));
  const formatter = [!forceFull, formatterOnly, formatterPaths(paths)].every(Boolean);
  const full = [!formatter, requiresFullValidation(paths, categories, forceFull)].every(Boolean);
  const previewRequired = [!formatter, requiresPreview(paths, forceFull)].every(Boolean);
  return {
    full,
    formatter,
    docs: categories.has('docs'),
    locales: categories.has('locales'),
    i18n: full || categories.has('locales'),
    workflows: touchesWorkflows(paths),
    previewRequired,
    jobs: selectExpectedJobs(full, previewRequired),
    reason: formatterReason(formatter, reason, full),
    paths,
  };
}
// Queue reductions are narrower: inert documentation or an independently proven formatter lock.
// Agent policy files and all GitHub configuration retain full queue validation.
function queueDocumentationPath(path) {
  if (typeof path !== 'string' || path.startsWith('.github/')) return false;
  if (agentInstructionPath(path)) return false;
  return [pathCategory(path) === 'docs', inertPath(path)].every(Boolean);
}
export function classifyQueuePaths(paths, options = {}) {
  const forceFull = options.forceFull || paths.length >= 300;
  const plan = classifyPaths(paths, {
    ...options,
    forceFull: forceFull || !queueReducedPaths(paths, options),
  });
  // Queue policy may force every CI job without making inert tooling a Pages build input.
  // Keep explicit full runs and uncertain/capped comparisons preview-required.
  return {
    ...plan,
    previewRequired: classifyPaths(paths, { ...options, forceFull }).previewRequired,
  };
}
function queueReducedPaths(paths, options) {
  if (options.formatterOnly && formatterPaths(paths)) return true;
  return paths.every(queueDocumentationPath);
}
/**
 * The trusted queue reuse check (scripts/preview/queue-reuse.mjs) proved this queue tree is the
 * one a member PR already passed full CI and a deployed preview on. Only the always-selected
 * jobs run again; the preview controller repeats the same proof before publishing its result.
 */
export function reusedQueuePlan(paths) {
  return {
    ...classifyPaths(paths),
    full: false,
    formatter: false,
    i18n: false,
    workflows: false,
    previewRequired: false,
    jobs: selectExpectedJobs(false, false),
    reused: true,
    reason: 'Queue tree is identical to a fully validated and previewed PR revision',
  };
}
function queueComparisonBase(git, base, head, baseSha, headSha) {
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new Error('Queue revisions must be immutable');
  const parents = git('rev-list', '--parents', '-n', '1', headSha).trim().split(' ');
  if (parents.join(' ') !== `${headSha} ${baseSha}`)
    throw new Error('Queue integration must have the exact base as its only parent');
  if (git('rev-parse', 'HEAD').trim() !== headSha)
    throw new Error('Queue checkout does not match the event head');
  return baseSha;
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
function collectLocalPaths(git, paths, local) {
  if (!local) return;
  paths.push(
    ...parseNameStatus(git('diff', '--name-status', '-z', '--find-renames', '--')),
    ...parseNameStatus(git('diff', '--cached', '--name-status', '-z', '--find-renames', '--')),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
  );
}
export function collectChanges({
  base = 'origin/main',
  head = 'HEAD',
  local = true,
  queue = false,
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
    const mergeBase = queue
      ? queueComparisonBase(git, base, head, baseSha, headSha)
      : git('merge-base', baseSha, headSha).trim();
    const paths = parseNameStatus(
      git('diff', '--name-status', '-z', '--find-renames', mergeBase, headSha, '--')
    );
    collectLocalPaths(git, paths, local && !queue);
    return {
      paths: [...new Set(paths)],
      baseSha,
      headSha,
      formatterOnly: localFormatterProof(git, baseSha, headSha, paths, local),
    };
  } catch {
    return {
      paths: [],
      error: 'Cannot resolve or read complete Git diff; selecting full validation',
    };
  }
}
function localFormatterProof(git, base, head, paths, local) {
  if (local) return false;
  if (!formatterPaths(paths)) return false;
  if (git('diff', '--summary', base, head, '--', 'package.json', 'pnpm-lock.yaml').trim())
    return false;
  const inputs = (ref) => ({
    manifest: git('show', `${ref}:package.json`),
    lock: git('show', `${ref}:pnpm-lock.yaml`),
  });
  return formatterOnlyChange(inputs(base), inputs(head));
}
function hasPlanShape(plan) {
  return Boolean(plan) && Array.isArray(plan.jobs) && typeof plan.full === 'boolean';
}
function selectExpectedJobs(full, previewRequired) {
  if (full) return [...fullJobs];
  const withPreview = previewRequired ? ['validate'] : [];
  return [...reducedJobs, ...withPreview];
}
export function isValidPlan(plan) {
  if (!hasPlanShape(plan)) return false;
  if (typeof plan.previewRequired !== 'boolean') return false;
  const expected = selectExpectedJobs(plan.full, plan.previewRequired);
  return expected.every((job) => plan.jobs.includes(job)) && plan.jobs.every(isKnownJob);
}
function isKnownJob(job) {
  return fullJobs.includes(job);
}
function outcomeError(needs, job, expected) {
  const result = needs[job]?.result;
  return result === expected ? null : `${job}: expected ${expected}, received ${String(result)}`;
}
function jobOutcomeError(plan, needs, job) {
  return outcomeError(needs, job, plan.jobs.includes(job) ? 'success' : 'skipped');
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
    classifierError(needs),
    unexpectedJobsError(needs),
  ].filter(Boolean);
}
function formatterReason(formatter, reason, full) {
  return (
    reason ||
    (formatter ? 'Verified lockfile-only Prettier resolution refresh' : defaultReason(full))
  );
}
