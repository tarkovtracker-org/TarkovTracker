/**
 * Player-facing "Highlights" for a release, written by PR authors in the PR template's
 * `## Release note` section. Commits without a PR reference, PRs whose note is empty or `none`,
 * and GitHub lookup failures contribute nothing: highlights are additive and never block a release.
 */
const PR_REFERENCE = /\(#(\d+)\)\s*$/;
const NOTE_HEADING = /^##[ \t]+release[ \t]+notes?[ \t]*$/im;
const NEXT_HEADING = /^#{1,2}[ \t]+\S/m;
const NO_NOTE = /^(?:none|n\/a|na|-+|no)\.?$/i;
const MAX_NOTE_LENGTH = 280;
const REQUEST_TIMEOUT_MS = 10_000;
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
function cleanNote(line) {
  const text = line
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_NOTE_LENGTH ? `${text.slice(0, MAX_NOTE_LENGTH - 1).trimEnd()}…` : text;
}
/** Player-facing notes from a PR body; `[]` when the section is missing, empty, or `none`. */
export function releaseNotesFromBody(body) {
  const section = noteSection(body).replace(/<!--[\s\S]*?-->/g, '');
  const bullets = section.split('\n').filter((line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line));
  const lines = bullets.length ? bullets : [section];
  return lines.map(cleanNote).filter((note) => note && !NO_NOTE.test(note));
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
function authorization(env = {}) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function fetchPullBody({ slug, number, env }) {
  const response = await fetch(`https://api.github.com/repos/${slug}/pulls/${number}`, {
    headers: { Accept: 'application/vnd.github+json', ...authorization(env) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for #${number}`);
  return (await response.json()).body;
}
async function notesForPull(options, number) {
  try {
    const body = await fetchPullBody({ ...options, number });
    return releaseNotesFromBody(body).map((text) => ({ number, text }));
  } catch (error) {
    options.logger.log('Skipping release note for #%d: %s', number, error.message);
    return [];
  }
}
/** Highlights for the given commits, in commit order, one entry per note line. */
export async function collectHighlights({ commits, env, repositoryUrl, logger }) {
  const slug = repositorySlug(env, repositoryUrl);
  if (!slug) return [];
  const numbers = [...new Set(commits.map((commit) => pullRequestNumber(commit.message)))];
  const options = { slug, env, logger };
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
