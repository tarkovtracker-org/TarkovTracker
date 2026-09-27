/**
 * Player-facing "Highlights" for a release, written by PR authors in the PR template's
 * `## Release note` section. Commits without a PR reference, PRs whose note is empty or `none`,
 * and GitHub lookup failures contribute nothing: highlights are additive and never block a release.
 *
 * Trust boundary: PR descriptions stay editable after merge, and batched releases publish days
 * later. A note is used only when the PR is merged and its description was last edited at or
 * before the merge (an edit in the same timestamp second is ambiguous and rejected), and only for PRs whose author currently has write access (checked through the
 * collaborator-permission API, not just the author association): anyone else able to edit that
 * description also has write access, which closes the auto-merge window in which a lower-privilege
 * author could change an approved note. Notes are reduced to plain text (no
 * link syntax, URLs, or HTML; only top-level bullets are highlights; nested and indented content
 * stays with its parent) so they cannot carry a link into the project's release notes. Untrusted
 * text is never matched by superlinear patterns: parsing is bounded by GitHub's body limit, each
 * bullet is bounded before sanitization, and autolinks are detected per whitespace token.
 * Highlights are added only after this release's version commit is verified to be HEAD
 * (`versionCommitted`, authenticated by this run's prepared HEAD SHA and its generated assets), so
 * PR text is published in the GitHub release but never written to the committed,
 * secret-scanned CHANGELOG.md. Lookups run with bounded concurrency and stop at the highlight cap.
 */
import { fromMarkdown } from 'mdast-util-from-markdown';
export { versionCommitted } from './release-note-state.mjs';
const PR_REFERENCE = /\(#(\d+)\)\s*$/;
const RELEASE_NOTE_HEADING = /^release notes?$/i;
// Zero leading whitespace: nested list markers and indented code are continuation content of
// their parent bullet, never new top-level highlights.
const TOP_LIST_ITEM = /^(?:[-*+]|\d+[.)])[ \t]+/;
const NESTED_LIST_ITEM = /^[ \t]+(?:[-*+]|\d+[.)])[ \t]+/;
const NO_NOTE = /^(?:none|n\/a|na|-+|no)\.?$/i;
const MAX_NOTE_LENGTH = 280;
const MAX_NOTES_PER_PULL = 3;
// PR bodies cannot exceed GitHub's own 65 536-character body limit, so this bound parses every
// real body whole while still bounding regex work on untrusted text.
const MAX_BODY_LENGTH = 65_536;
// A raw bullet cannot usefully shrink toward nothing while joining wrapper lines, so a bounded
// prefix is sanitized before the 280-code-point cap.
const MAX_RAW_NOTE = 4_096;
// The in-app changelog shows at most MAX_BULLETS_PER_GROUP (5) bullets per release, and
// Highlights come first, so a larger cap would hide later notes there.
const MAX_HIGHLIGHTS = 5;
const MAX_COMMIT_LINKS = 20;
// PR lookups run with bounded concurrency so a batched release cannot hit GitHub's secondary
// limits, and workers stop launching once MAX_HIGHLIGHTS notes are collectable.
export const MAX_CONCURRENT_LOOKUPS = 4;
const TRUSTED_AUTHORS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
// `permission` is the effective base permission (custom and `maintain` roles map to `write`).
const WRITE_PERMISSIONS = new Set(['write', 'admin']);
const REVERTS = /^This reverts commit ([0-9a-f]{7,40})\b/im;
const REQUEST_TIMEOUT_MS = 10_000;
const PULL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      body merged mergedAt lastEditedAt authorAssociation author { login }
    }
  }
}`;
/** PR number from a squash-merge header such as `fix(app): keep totals (#943)`. */
export function pullRequestNumber(message) {
  const header = String(message ?? '').split('\n')[0];
  const match = header.match(PR_REFERENCE);
  return match ? Number(match[1]) : null;
}
function pushChildren(stack, children) {
  for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
}
const hasChildren = (node) => Array.isArray(node.children);
function isFencedCode(node, source) {
  if (node.type !== 'code') return false;
  // Fenced nodes start at their marker; indented code starts at the line indentation.
  const marker = source[node.position.start.offset];
  return marker === '`' || marker === '~';
}
const isMaskedNode = (node, source) => node.type === 'html' || isFencedCode(node, source);
function collectMaskRanges(source, root) {
  const nodes = [];
  const ranges = [];
  pushChildren(nodes, root.children);
  while (nodes.length) {
    const node = nodes.pop();
    if (isMaskedNode(node, source)) {
      ranges.push({ start: node.position.start.offset, end: node.position.end.offset });
    }
    if (hasChildren(node)) pushChildren(nodes, node.children);
  }
  return ranges;
}
function appendMaskedRange(state, range, source) {
  if (range.end <= state.offset) return;
  const start = Math.max(range.start, state.offset);
  state.text += source.slice(state.offset, start);
  // Preserve offsets and text adjacency until sentinels are removed before sanitization.
  state.text += source.slice(start, range.end).replace(/[^\n]/g, '\0');
  state.offset = range.end;
}
function maskRanges(source, ranges) {
  const state = { text: '', offset: 0 };
  ranges
    .sort((left, right) => left.start - right.start)
    .forEach((range) => {
      appendMaskedRange(state, range, source);
    });
  return state.text + source.slice(state.offset);
}
function appendNodeText(stack, text) {
  const node = stack.pop();
  if (node.type === 'text' || node.type === 'inlineCode') text.push(node.value);
  else if (hasChildren(node)) pushChildren(stack, node.children);
}
function headingText(heading) {
  const stack = [];
  const text = [];
  pushChildren(stack, heading.children);
  while (stack.length) appendNodeText(stack, text);
  return text.join('').replace(/\s+/g, ' ').trim();
}
const isReleaseHeading = (node) =>
  node.type === 'heading' && node.depth === 2 && RELEASE_NOTE_HEADING.test(headingText(node));
const isSectionBoundary = (node) => node.type === 'heading' && node.depth <= 2;
function noteSection(body) {
  const source = String(body ?? '')
    .slice(0, MAX_BODY_LENGTH)
    .replace(/\r\n/g, '\n');
  const root = fromMarkdown(source);
  const startIndex = root.children.findIndex(isReleaseHeading);
  if (startIndex === -1) return '';
  const heading = root.children[startIndex];
  const nextIndex = root.children.findIndex(
    (node, index) => index > startIndex && isSectionBoundary(node)
  );
  const end = nextIndex === -1 ? source.length : root.children[nextIndex].position.start.offset;
  return maskRanges(source, collectMaskRanges(source, root))
    .slice(heading.position.end.offset, end)
    .replace(/^\n+/, '');
}
// A live autolink can only start inside one whitespace-delimited token. Each token is checked
// with bounded, non-overlapping matches (no large optional spans that backtrack superlinearly on
// untrusted text), and a token that could render as a link (scheme or protocol-relative `//`,
// `www.` autolink, or an email) is dropped whole.
function emailish(token) {
  const at = token.indexOf('@');
  return at > 0 && /\.\w/.test(token.slice(at + 1));
}
const autolinked = (token) => token.includes('//') || /www\./i.test(token) || emailish(token);
function stripHtml(text) {
  // A removal can join nested fragments into another tag. Reach a fixed point on the already
  // bounded note before checking links; a leftover malformed opener loses its single '<'.
  let previous;
  do {
    previous = text;
    text = text.replace(/<\/?[a-z][^<>]*>/gi, '');
  } while (text !== previous);
  return text.replace(/<(?=[a-z/!?])/gi, '');
}
function plainText(line) {
  return stripHtml(line.replace(/\0/g, ''))
    .replace(/^[ ]{0,3}>[ \t]?/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[[\]!]*\[|\]/g, '')
    .replace(/[*_`~]/g, '')
    .split(/\s+/)
    .map((token) => (autolinked(token) ? '' : token))
    .join(' ');
}
function cleanNote(item) {
  // Sanitization only ever shortens, so a bounded raw prefix cannot lose a shorter highlight.
  const text = plainText(Array.from(item).slice(0, MAX_RAW_NOTE).join(''))
    .replace(TOP_LIST_ITEM, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Count and cut by code point so a surrogate pair is never split.
  const chars = Array.from(text);
  if (chars.length <= MAX_NOTE_LENGTH) return text;
  return `${chars
    .slice(0, MAX_NOTE_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}
// Each top-level list item keeps its wrapped, nested, and indented code continuation lines; a
// blank line or prose paragraph ends it. Indented markers never start new items here, and their
// marker tokens are dropped so nested content reads as plain text with its parent.
function listItems(section) {
  const blocks = section.split(/\n[ \t]*\n/);
  const lines = blocks.flatMap((block) => (TOP_LIST_ITEM.test(block) ? block.split('\n') : []));
  return lines.reduce((items, line) => {
    if (TOP_LIST_ITEM.test(line)) items.push(line);
    else if (items.length) items[items.length - 1] += ` ${line.replace(NESTED_LIST_ITEM, '')}`;
    return items;
  }, []);
}
const publishable = (note) => Boolean(note) && !NO_NOTE.test(note);
/** Player-facing notes from a PR body; `[]` when the section is missing, empty, or `none`. */
export function releaseNotesFromBody(body) {
  const section = noteSection(body);
  const items = listItems(section);
  const notes = items.length ? items : [section];
  return notes.map(cleanNote).filter(publishable).slice(0, MAX_NOTES_PER_PULL);
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
// A missing lastEditedAt parses to NaN, and NaN >= mergedAt is false: never edited is reviewed.
// GitHub timestamps have second precision, so an edit in the merge's second may follow the merge.
const editedAfterMerge = (pull) => Date.parse(pull.lastEditedAt) >= Date.parse(pull.mergedAt);
const REVIEW_CHECKS = [
  [(pull) => !pull?.merged, 'PR is not merged'],
  [(pull) => !TRUSTED_AUTHORS.has(pull.authorAssociation), 'PR author lacks write access'],
  [editedAfterMerge, 'description was edited after merge'],
];
/** Why a PR's current description cannot be published, or null when it is the merged text. */
export function unreviewedReason(pull) {
  return REVIEW_CHECKS.find(([fails]) => fails(pull))?.[1] ?? null;
}
async function githubRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}
// Association alone is a prefilter; the permission API confirms current write access.
async function authorCanWrite({ slug, token }, login) {
  if (!login) return false;
  const url = `https://api.github.com/repos/${slug}/collaborators/${encodeURIComponent(login)}/permission`;
  const permission = await githubRequest(url, token);
  return WRITE_PERMISSIONS.has(permission.permission);
}
function graphQLErrorMessage(errors) {
  if (!errors || errors.length === 0) return '';
  return `GitHub GraphQL returned errors: ${errors[0].message}`;
}
async function queryPull({ slug, token }, number) {
  const [owner, name] = slug.split('/');
  const result = await githubRequest('https://api.github.com/graphql', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PULL_QUERY, variables: { owner, name, number } }),
  });
  const errorMessage = graphQLErrorMessage(result.errors);
  if (errorMessage) throw new Error(errorMessage);
  return result.data?.repository?.pullRequest;
}
async function fetchPull(options, number) {
  const pull = await queryPull(options, number);
  const reason = unreviewedReason(pull);
  if (reason) throw new Error(reason);
  if (!(await authorCanWrite(options, pull.author?.login))) {
    throw new Error('PR author lacks write access');
  }
  return pull.body;
}
async function notesForPull(options, number) {
  try {
    const body = await fetchPull(options, number);
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
// Look up notes for every PR number with bounded concurrency, no longer launching once the
// release's highlight cap is collectable. Results are held per number, so assembly below stays
// in commit order regardless of completion order.
async function collectNotes(options, numbers) {
  const results = [];
  let collected = 0;
  let next = 0;
  const worker = async () => {
    while (collected < MAX_HIGHLIGHTS) {
      const index = next++;
      if (index >= numbers.length) return;
      const notes = await notesForPull(options, numbers[index]);
      results[index] = notes;
      collected += notes.length;
    }
  };
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_LOOKUPS, numbers.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}
/**
 * Highlights for the given commits, in commit order, one entry per note. Reverts are paired across
 * every commit in the range before `excluded` (e.g. internal scopes) drops candidates, so an
 * excluded commit can still cancel the change it reverts. Lookups run with bounded concurrency
 * and stop once the release cap is collectable, so a batch cannot flood the API.
 */
export async function collectHighlights({ commits, excluded = () => false, ...context }) {
  const options = lookupOptions(context);
  if (!options) return [];
  const cancelled = cancelledCommits(commits);
  const kept = commits.filter((commit) => !cancelled.has(commit) && !excluded(commit));
  const numbers = [...new Set(kept.map((commit) => pullRequestNumber(commit.message)))].filter(
    Boolean
  );
  const shasByNumber = new Map(
    numbers.map((number) => [
      number,
      [
        ...new Set(
          kept
            .filter((commit) => pullRequestNumber(commit.message) === number)
            .map((commit) => commitHash(commit))
            .filter((hash) => /^[0-9a-f]{40}$/i.test(hash))
        ),
      ].map((hash) => hash.toLowerCase()),
    ])
  );
  const results = await collectNotes(options, numbers);
  return results
    .flatMap((notes) => notes ?? [])
    .slice(0, MAX_HIGHLIGHTS)
    .map((highlight) => {
      const shas = shasByNumber.get(highlight.number) ?? [];
      return shas.length ? { ...highlight, shas } : highlight;
    });
}
/** Insert a `### Highlights` list directly below the version heading of generated notes. */
export function withHighlights(notes, highlights, slug) {
  if (!highlights.length) return notes;
  const items = highlights.map(({ number, text, shas }) => {
    const pull = `[#${number}](https://github.com/${slug}/pull/${number})`;
    const commits = [
      ...new Set(
        (Array.isArray(shas) ? shas : [])
          .filter((hash) => typeof hash === 'string' && /^[0-9a-f]{40}$/i.test(hash))
          .map((hash) => hash.toLowerCase())
      ),
    ]
      .slice(0, MAX_COMMIT_LINKS)
      .map((hash) => `[${hash.slice(0, 7)}](https://github.com/${slug}/commit/${hash})`);
    return `* ${text} (${pull})${commits.map((link) => ` (${link})`).join('')}`;
  });
  const block = `### Highlights\n\n${items.join('\n')}\n`;
  const [heading, ...rest] = String(notes).split('\n');
  return [heading, '', '', block, ...rest].join('\n').replace(/\n{4,}/g, '\n\n\n');
}
