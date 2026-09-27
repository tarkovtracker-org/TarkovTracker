/**
 * Player-facing "Highlights" for a release, written by PR authors in the PR template's
 * `## Release note` section. Commits without a PR reference, PRs whose note is empty or `none`,
 * and GitHub lookup failures contribute nothing: highlights are additive and never block a release.
 *
 * Trust boundary: PR descriptions stay editable after merge, and batched releases publish days
 * later. A note is used only when the PR is merged and its description was last edited at or
 * before the merge, i.e. the text the merging maintainer saw. Notes are reduced to plain text (no
 * link syntax, URLs, or HTML) so they cannot carry a link into the project's release notes.
 * Highlights are added only after the version commit exists (`versionCommitted`), so PR text is
 * published in the GitHub release but never written to the committed, secret-scanned CHANGELOG.md.
 */
import { execFileSync } from 'node:child_process';
const PR_REFERENCE = /\(#(\d+)\)\s*$/;
const NOTE_HEADING = /^##[ \t]+release[ \t]+notes?[ \t]*$/im;
const NEXT_HEADING = /^#{1,2}[ \t]+\S/m;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const NO_NOTE = /^(?:none|n\/a|na|-+|no)\.?$/i;
const MAX_NOTE_LENGTH = 280;
const FENCED_CODE = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm;
// GitHub hides an unterminated comment through the end of the body, so strip to the end too.
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$(?![\s\S]))/g;
const REVERTS = /^This reverts commit ([0-9a-f]{7,40})\b/im;
const REQUEST_TIMEOUT_MS = 10_000;
const PULL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { body merged mergedAt lastEditedAt }
  }
}`;
/** PR number from a squash-merge header such as `fix(app): keep totals (#943)`. */
export function pullRequestNumber(message) {
  const header = String(message ?? '').split('\n')[0];
  const match = header.match(PR_REFERENCE);
  return match ? Number(match[1]) : null;
}
function noteSection(body) {
  // Hidden comments and fenced examples cannot start or end the real section.
  const text = String(body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(HTML_COMMENT, '')
    .replace(FENCED_CODE, '');
  const start = text.search(NOTE_HEADING);
  if (start === -1) return '';
  const rest = text.slice(start).replace(NOTE_HEADING, '');
  const end = rest.search(NEXT_HEADING);
  return end === -1 ? rest : rest.slice(0, end);
}
// Drop link targets, then all brackets, so no (nested) link syntax can survive; remove URLs of any
// scheme, protocol-relative and `www.` autolinks, and HTML tags (`<b>`, not `< 20 kg`).
function plainText(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[[\]!]*\[|\]/g, '')
    .replace(/(?:\b[a-z][\w+.-]*:)?\/\/\S+|\bwww\.\S+/gi, '')
    .replace(/<\/?[a-z][^<>]*>/gi, '');
}
function cleanNote(item) {
  const text = plainText(item).replace(LIST_ITEM, '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_NOTE_LENGTH ? `${text.slice(0, MAX_NOTE_LENGTH - 1).trimEnd()}…` : text;
}
// Each list item keeps its wrapped continuation lines; a blank line or prose paragraph ends it.
function listItems(section) {
  const blocks = section.split(/\n[ \t]*\n/);
  const lines = blocks.filter((block) => LIST_ITEM.test(block)).flatMap((b) => b.split('\n'));
  return lines.reduce((items, line) => {
    if (LIST_ITEM.test(line)) items.push(line);
    else if (items.length) items[items.length - 1] += ` ${line}`;
    return items;
  }, []);
}
const publishable = (note) => Boolean(note) && !NO_NOTE.test(note);
/** Player-facing notes from a PR body; `[]` when the section is missing, empty, or `none`. */
export function releaseNotesFromBody(body) {
  const section = noteSection(body);
  const items = listItems(section);
  const notes = items.length ? items : [section];
  return notes.map(cleanNote).filter(publishable);
}
const revertedPrefix = (commit) =>
  String(commit.message ?? '')
    .match(REVERTS)?.[1]
    ?.toLowerCase();
const commitHash = (commit) => String(commit.hash ?? '').toLowerCase();
// The in-range commit a revert targets, if any (never itself).
function revertTarget(commit, commits) {
  const prefix = revertedPrefix(commit);
  if (!prefix) return null;
  return commits.find((other) => other !== commit && commitHash(other).startsWith(prefix)) ?? null;
}
// For each commit in the range, the in-range commit it reverts.
function revertTargets(commits) {
  const pairs = commits.map((commit) => [commit, revertTarget(commit, commits)]);
  return new Map(pairs.filter(([, target]) => target));
}
/**
 * Commits whose highlight should be omitted: every commit whose effect is undone by an effective
 * in-range revert, and every effective revert of an in-range commit (a removal or a restore). A
 * revert is effective unless it is itself effectively reverted, so chains resolve by parity: a
 * change, its revert, and a revert of that revert leave the original change highlighted.
 */
export function cancelledCommits(commits) {
  const targets = revertTargets(commits);
  const revertersOf = (commit) => [...targets].filter(([, target]) => target === commit);
  const effective = new Map();
  const isEffective = (commit) => {
    if (!effective.has(commit)) {
      effective.set(commit, true);
      effective.set(commit, !revertersOf(commit).some(([reverter]) => isEffective(reverter)));
    }
    return effective.get(commit);
  };
  return new Set(commits.filter((commit) => !isEffective(commit) || targets.has(commit)));
}
/** Whether the release's version commit exists, i.e. CHANGELOG.md has already been committed. */
export function versionCommitted({ cwd, nextRelease }) {
  try {
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd, encoding: 'utf8' });
    return subject.trim() === `chore(release): ${nextRelease?.version}`;
  } catch {
    return false;
  }
}
const SLUG = /^[\w.-]+\/[\w.-]+$/;
const GITHUB_URL = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;
function slugFromUrl(repositoryUrl) {
  const match = String(repositoryUrl).match(GITHUB_URL);
  return match ? `${match[1]}/${match[2]}` : null;
}
/** `owner/repo` from the Actions environment, else from semantic-release's repository URL. */
export function repositorySlug(env = {}, repositoryUrl = '') {
  const fromEnv = String(env.GITHUB_REPOSITORY);
  return SLUG.test(fromEnv) ? fromEnv : slugFromUrl(repositoryUrl);
}
/** Why a PR's current description cannot be published, or null when it is the merged text. */
export function unreviewedReason(pull) {
  if (!pull?.merged) return 'PR is not merged';
  // A missing lastEditedAt parses to NaN, and NaN > mergedAt is false: never edited is reviewed.
  const editedAfterMerge = Date.parse(pull.lastEditedAt) > Date.parse(pull.mergedAt);
  return editedAfterMerge ? 'description was edited after merge' : null;
}
async function fetchPull({ slug, number, token }) {
  const [owner, name] = slug.split('/');
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PULL_QUERY, variables: { owner, name, number } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for #${number}`);
  const pull = (await response.json()).data?.repository?.pullRequest;
  const reason = unreviewedReason(pull);
  if (reason) throw new Error(reason);
  return pull.body;
}
async function notesForPull(options, number) {
  try {
    const body = await fetchPull({ ...options, number });
    return releaseNotesFromBody(body).map((text) => ({ number, text }));
  } catch (error) {
    options.logger.log('Skipping release note for #%d: %s', number, error.message);
    return [];
  }
}
function lookupOptions({ env = {}, repositoryUrl, logger }) {
  const slug = repositorySlug(env, repositoryUrl);
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  return slug && token ? { slug, token, logger } : null;
}
/** Highlights for the given commits, in commit order, one entry per note. */
export async function collectHighlights({ commits, ...context }) {
  const options = lookupOptions(context);
  if (!options) return [];
  const cancelled = cancelledCommits(commits);
  const kept = commits.filter((commit) => !cancelled.has(commit));
  const numbers = [...new Set(kept.map((commit) => pullRequestNumber(commit.message)))];
  const notes = await Promise.all(numbers.filter(Boolean).map((n) => notesForPull(options, n)));
  return notes.flat();
}
/** Insert a `### Highlights` list directly below the version heading of generated notes. */
export function withHighlights(notes, highlights, slug) {
  if (!highlights.length) return notes;
  const items = highlights.map(
    ({ number, text }) => `* ${text} ([#${number}](https://github.com/${slug}/pull/${number}))`
  );
  const block = `### Highlights\n\n${items.join('\n')}\n`;
  const [heading, ...rest] = String(notes).split('\n');
  return [heading, '', '', block, ...rest].join('\n').replace(/\n{4,}/g, '\n\n\n');
}
