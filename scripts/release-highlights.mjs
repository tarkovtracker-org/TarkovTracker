/**
 * Player-facing "Highlights" for a release, written by PR authors in the PR template's
 * `## Release note` section. Commits without a PR reference, PRs whose note is empty or `none`,
 * and GitHub lookup failures contribute nothing: highlights are additive and never block a release.
 *
 * Trust boundary: PR descriptions stay editable after merge, and batched releases publish days
 * later. A note is used only when the PR is merged and its description was last edited at or
 * before the merge, i.e. the text the merging maintainer saw. Links, images, URLs, and HTML tags
 * are stripped so a note cannot carry a link into the project's release notes.
 */
const PR_REFERENCE = /\(#(\d+)\)\s*$/;
const NOTE_HEADING = /^##[ \t]+release[ \t]+notes?[ \t]*$/im;
const NEXT_HEADING = /^#{1,2}[ \t]+\S/m;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const NO_NOTE = /^(?:none|n\/a|na|-+|no)\.?$/i;
const MAX_NOTE_LENGTH = 280;
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
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const start = text.search(NOTE_HEADING);
  if (start === -1) return '';
  const rest = text.slice(start).replace(NOTE_HEADING, '');
  const end = rest.search(NEXT_HEADING);
  return end === -1 ? rest : rest.slice(0, end);
}
// Markdown images/links become their text; bare URLs and HTML tags (`<b>`, not `< 20 kg`) go.
function plainText(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\bhttps?:\/\/\S+/gi, '')
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
/** Player-facing notes from a PR body; `[]` when the section is missing, empty, or `none`. */
export function releaseNotesFromBody(body) {
  const section = noteSection(body).replace(/<!--[\s\S]*?-->/g, '');
  const items = listItems(section);
  const notes = items.length ? items : [section];
  return notes.map(cleanNote).filter((note) => note && !NO_NOTE.test(note));
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
  const numbers = [...new Set(commits.map((commit) => pullRequestNumber(commit.message)))];
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
