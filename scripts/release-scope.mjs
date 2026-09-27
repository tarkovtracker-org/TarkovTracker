import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  collectHighlights,
  repositorySlug,
  versionCommitted,
  withHighlights,
} from './release-highlights.mjs';
/**
 * Conventional-commit scopes for tooling, automation, documentation, and dependencies. Commits
 * with these scopes never create a release and are left out of release notes, even when their type
 * is `feat`, `fix`, or `perf`. `no-release` is an explicit opt-out for any other change. Keep the
 * list aligned with the in-app changelog's internal-scope filter.
 */
export const INTERNAL_SCOPES = Object.freeze([
  'agents',
  'build',
  'ci',
  'config',
  'dependencies',
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
// Git's default `Revert "<header>"` and conventional `revert: <header>` wrap the reverted header,
// possibly repeatedly (`Revert "Revert "fix(ci): …""`).
const REVERT_WRAPPER = /^(?:revert[ \t]+"|revert:[ \t]*)+/i;
/** Whether a commit message's header, or the header it reverts, names an internal scope. */
export function isInternalCommit(message) {
  const header = String(message ?? '').replace(REVERT_WRAPPER, '');
  const scope = header.match(HEADER)?.[1];
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
/**
 * semantic-release `generateNotes` step with internal-scope commits removed. semantic-release
 * regenerates notes after the release-commit prepare step moves HEAD; only that pass, which feeds
 * the GitHub release but not CHANGELOG.md, adds PR highlights.
 */
export async function generateNotes(config, context) {
  const generator = await load('@semantic-release/release-notes-generator');
  const filtered = playerFacing(context);
  const notes = await generator.generateNotes(config, filtered);
  if (!versionCommitted(context)) return notes;
  const repositoryUrl = context.options?.repositoryUrl;
  const slug = repositorySlug(context.env, repositoryUrl);
  const highlights = await collectHighlights({
    ...context,
    excluded: (commit) => isInternalCommit(commit.message),
    repositoryUrl,
  });
  return withHighlights(notes, highlights, slug);
}
