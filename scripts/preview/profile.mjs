// Disposable hosted CI scope probe; no preview behavior changes.
import { createHash } from 'node:crypto';
// Fixed identity of the Cloudflare Pages project that receives Actions-owned previews. The trusted
// controller never reads these values from candidate manifests; it recomputes them and compares.
export const PAGES_PROJECT = 'tarkovtracker';
export const PAGES_DOMAIN = 'tarkovtrackernuxt.pages.dev';
export const PRODUCTION_BRANCH = 'main';
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const ARTIFACT_NAME = 'pages-preview';
export const MANIFEST_FILE = 'preview-manifest.json';
export const MANIFEST_VERSION = 1;
// Bump when the anonymous preview build settings or the deployment procedure change so older
// artifacts and already-published previews are not reused across incompatible profiles.
export const PREVIEW_PROFILE_VERSION = 1;
export const STATUS_CONTEXT = 'Preview Result';
// Cloudflare derives branch aliases by lowercasing, replacing non-alphanumerics with hyphens, and
// truncating to this length. Generated branch names already satisfy that form so alias == branch.
const BRANCH_ALIAS_LIMIT = 28;
const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,26}[a-z0-9])?$/;
function slugify(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}
function branchDigest(branch) {
  return createHash('sha256').update(String(branch)).digest('hex').slice(0, 8);
}
function truncateAlias(value) {
  return value.slice(0, BRANCH_ALIAS_LIMIT).replaceAll(/-+$/g, '');
}
function hasPositivePullRequest(pullRequest) {
  return Number.isInteger(pullRequest) && pullRequest > 0;
}
function dispatchBranchName(branch) {
  const prefix = `preview-${slugify(branch)}`;
  return truncateAlias(`${prefix.slice(0, BRANCH_ALIAS_LIMIT - 9)}-${branchDigest(branch)}`);
}
function branchInputError(branch) {
  const usable = typeof branch === 'string' && branch.trim() && branch !== PRODUCTION_BRANCH;
  return usable ? null : 'Preview requires a pull request number or a non-production branch.';
}
/** Deterministic non-production Pages branch for one candidate; never the production branch. */
export function previewBranchName({ pullRequest, branch }) {
  if (hasPositivePullRequest(pullRequest)) return `preview-pr-${pullRequest}`;
  const error = branchInputError(branch);
  if (error) throw new Error(error);
  return dispatchBranchName(branch);
}
export function isValidPreviewBranch(name) {
  return (
    typeof name === 'string' &&
    ALIAS_PATTERN.test(name) &&
    name.startsWith('preview-') &&
    name !== PRODUCTION_BRANCH
  );
}
export function previewAppUrl(previewBranch) {
  if (!isValidPreviewBranch(previewBranch)) throw new Error('Invalid preview branch name.');
  return `https://${previewBranch}.${PAGES_DOMAIN}`;
}
const STRIPE_PRICE_KEYS = [
  'STRIPE_PRICE_SCAV_MONTHLY',
  'STRIPE_PRICE_SCAV_6MONTH',
  'STRIPE_PRICE_SCAV_YEARLY',
  'STRIPE_PRICE_TIMMY_MONTHLY',
  'STRIPE_PRICE_TIMMY_6MONTH',
  'STRIPE_PRICE_TIMMY_YEARLY',
  'STRIPE_PRICE_CHAD_MONTHLY',
  'STRIPE_PRICE_CHAD_6MONTH',
  'STRIPE_PRICE_CHAD_YEARLY',
];
/**
 * Anonymous preview build settings. Supabase, analytics, log forwarding, Turnstile, and Stripe are
 * explicitly empty so the build never embeds production identifiers; the application's existing
 * offline Supabase fallback activates on `pages.dev` hostnames. `CI=true` keeps the Stripe build
 * guard in nuxt.config.ts from rejecting the intentionally empty keys.
 */
export function previewBuildEnv(previewBranch) {
  return {
    NODE_ENV: 'production',
    CI: 'true',
    APP_URL: previewAppUrl(previewBranch),
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    NUXT_SUPABASE_SERVICE_KEY: '',
    GA_MEASUREMENT_ID: '',
    CLARITY_PROJECT_ID: '',
    NUXT_PUBLIC_CLIENT_LOG_SINK_URL: '',
    NUXT_LOG_SINK_URL: '',
    NUXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    NUXT_TURNSTILE_SECRET_KEY: '',
    STRIPE_SECRET_KEY: '',
    CODECOV_TOKEN: '',
    ...Object.fromEntries(STRIPE_PRICE_KEYS.map((key) => [key, ''])),
  };
}
function dispatchProfile(branch) {
  if (branch === PRODUCTION_BRANCH) return { profile: 'production' };
  const previewBranch = previewBranchName({ branch });
  return { profile: 'preview', previewBranch, appUrl: previewAppUrl(previewBranch) };
}
/**
 * Decide which Pages output `Validate` builds. Main pushes and main dispatches keep the production
 * configuration; pull requests and non-main dispatches build the anonymous preview profile.
 */
export function resolveBuildProfile({ eventName, refName, pullRequest }) {
  if (eventName === 'pull_request') {
    const previewBranch = previewBranchName({ pullRequest: Number(pullRequest) });
    return { profile: 'preview', previewBranch, appUrl: previewAppUrl(previewBranch) };
  }
  if (eventName === 'workflow_dispatch') return dispatchProfile(refName);
  return { profile: 'production' };
}
