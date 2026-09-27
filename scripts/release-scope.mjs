import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { collectHighlights, repositorySlug, withHighlights } from './release-highlights.mjs';
/**
 * Conventional-commit scopes for tooling, automation, documentation, and dependencies. Commits
 * with these scopes never create a release and are left out of release notes, even when their type
 * is `feat`, `fix`, or `perf`. Mirrors INTERNAL_SCOPES in app/utils/changelog.ts, plus the explicit
 * `no-release` opt-out.
 */
export const INTERNAL_SCOPES = Object.freeze([
  'agents',
  'build',
  'ci',
  'config',
  'deps',
  'deps-dev',
  'docs',
  'no-release',
  'preview',
  'previews',
  'release',
  'repo',
  'scripts',
  'spec',
  'test',
  'tests',
  'workflow',
]);
const INTERNAL = new Set(INTERNAL_SCOPES);
// Matches `type(scope)!: subject`; the scope group is absent for unscoped headers.
const HEADER = /^[a-z]+\(([^)]+)\)!?:/i;
/** Whether a commit message's header names an internal scope. */
export function isInternalCommit(message) {
  const scope = String(message ?? '').match(HEADER)?.[1];
  return Boolean(scope) && INTERNAL.has(scope.trim().toLowerCase());
}
function playerFacing(context) {
  const commits = context.commits.filter((commit) => !isInternalCommit(commit.message));
  const skipped = context.commits.length - commits.length;
  if (skipped) context.logger.log('Ignoring %d internal-scope commit(s) for this release', skipped);
  return { ...context, commits };
}
// Load the plugin copies semantic-release itself depends on, so versions stay locked together.
const requireFromSemanticRelease = createRequire(import.meta.resolve('semantic-release'));
async function load(name) {
  return import(pathToFileURL(requireFromSemanticRelease.resolve(name)).href);
}
/** semantic-release `analyzeCommits` step with internal-scope commits removed. */
export async function analyzeCommits(config, context) {
  const analyzer = await load('@semantic-release/commit-analyzer');
  return analyzer.analyzeCommits(config, playerFacing(context));
}
/** semantic-release `generateNotes` step with internal-scope commits removed. */
export async function generateNotes(config, context) {
  const generator = await load('@semantic-release/release-notes-generator');
  const filtered = playerFacing(context);
  const notes = await generator.generateNotes(config, filtered);
  const repositoryUrl = context.options?.repositoryUrl;
  const slug = repositorySlug(context.env, repositoryUrl);
  const highlights = await collectHighlights({ ...filtered, repositoryUrl });
  return withHighlights(notes, highlights, slug);
}
