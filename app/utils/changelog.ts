export const cleanText = (value: string): string => {
  let text = value.replace(/(?:\s*\(#\d+\))+\s*$/, '');
  text = text.replace(/\s*\[[^\]]+\]\s*$/, '');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/[`*_~]/g, '');
  text = text.replace(/[_/]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};
export const toSentence = (value: string): string => {
  let text = cleanText(value);
  if (!text) return '';
  const firstChar = text.charAt(0);
  if (firstChar) {
    text = firstChar.toUpperCase() + text.slice(1);
  }
  if (!/[.!?]$/.test(text)) {
    text += '.';
  }
  return text;
};
// Conventional commit types players can notice, with the leading verb the changelog page turns
// into a badge (`app/pages/changelog.vue`).
const USER_FACING_VERBS: Readonly<Record<string, string>> = Object.freeze({
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Improved',
  ui: 'Updated',
});
// Scopes for tooling, automation, documentation, and dependencies. A `fix(ci):` commit is still
// internal even though its type would otherwise be user-facing. `no-release` is the explicit
// opt-out. Keep aligned with `INTERNAL_SCOPES` in `scripts/release/release-scope.mjs`.
const INTERNAL_SCOPES = new Set([
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
const CONVENTIONAL_PATTERN = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/i;
// semantic-release entry: `* **scope:** subject ([#12](url)) ([abc1234](url)), closes [#9](url)`
const RELEASE_SCOPE_PATTERN = /^\*\*([^*:]+):\*\*\s*/;
const RELEASE_REFERENCE_PATTERN = /\s*\(\[[^\]]+\]\([^)]+\)\)/g;
// Only the generated trailer, e.g. `, closes [#9](url) [#10](url)` (comma or space separated);
// never words in the subject.
const RELEASE_CLOSES_PATTERN = /,\s*closes\s+\[#\d+\]\([^)]*\)(?:[,\s]+\[#\d+\]\([^)]*\))*\s*$/i;
const RELEASE_COMMIT_PATTERN = /\/commit\/([0-9a-f]{40})\b/gi;
const isInternalScope = (scope: string | undefined): boolean =>
  Boolean(scope) && INTERNAL_SCOPES.has(String(scope).trim().toLowerCase());
const INFERRED_MAP: Readonly<Record<string, string>> = Object.freeze({
  add: 'Added',
  adds: 'Added',
  added: 'Added',
  fix: 'Fixed',
  fixes: 'Fixed',
  fixed: 'Fixed',
  improve: 'Improved',
  improves: 'Improved',
  improved: 'Improved',
  update: 'Updated',
  updates: 'Updated',
  updated: 'Updated',
  refactor: 'Improved',
  refactors: 'Improved',
  refactored: 'Improved',
});
type ReleaseBulletSource = { line: string; highlights: boolean };
const RELEASE_BULLET_PREFIX = /^(?:[-*]\s+|\d+\.\s+)/;
const HIGHLIGHTS_HEADING = /^###\s+Highlights\s*#*$/i;
const MARKDOWN_PUNCTUATION = new Set([
  '\\',
  '`',
  '*',
  '_',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  '#',
  '+',
  '-',
  '.',
  '!',
  '|',
  '~',
]);
const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
});
const releaseBulletSources = (body: string | null | undefined): ReleaseBulletSource[] => {
  if (!body) return [];
  let inHighlights = false;
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const records = lines.flatMap((line) => {
    if (line.startsWith('#')) {
      inHighlights = HIGHLIGHTS_HEADING.test(line);
      return [];
    }
    return [{ line, highlights: inHighlights }];
  });
  const bullets = records.filter(({ line }) => RELEASE_BULLET_PREFIX.test(line));
  const source = bullets.length ? bullets : records;
  return source.map(({ line, highlights }) => ({
    line: line.replace(RELEASE_BULLET_PREFIX, '').trim(),
    highlights,
  }));
};
export const extractReleaseBullets = (body: string | null | undefined): string[] =>
  releaseBulletSources(body).map(({ line }) => line);
/** Player-facing sentence for one semantic-release entry, or null for internal/empty entries. */
export const toReleaseBullet = (line: string): string | null => {
  if (isInternalScope(line.match(RELEASE_SCOPE_PATTERN)?.[1])) return null;
  const subject = line
    .replace(RELEASE_SCOPE_PATTERN, '')
    .replace(RELEASE_CLOSES_PATTERN, '')
    .replace(RELEASE_REFERENCE_PATTERN, '');
  return toSentence(subject) || null;
};
export type ReleaseEntry = { text: string; shas: string[] };
const commitShas = (line: string): string[] =>
  Array.from(line.matchAll(RELEASE_COMMIT_PATTERN), (match) => String(match[1]).toLowerCase());
const decodeHighlightEntities = (line: string): string =>
  line.replace(/&(amp|lt|gt);/gi, (entity, name: string) => {
    return HTML_ENTITIES[name.toLowerCase()] ?? entity;
  });
const decodeHighlightMarkdownEscapes = (line: string): string =>
  line.replace(/\\(.)/g, (escape) => {
    const character = escape.charAt(1);
    return MARKDOWN_PUNCTUATION.has(character) ? character : escape;
  });
const toHighlightSentence = (line: string): string => {
  let text = decodeHighlightMarkdownEscapes(
    decodeHighlightEntities(line.replace(RELEASE_REFERENCE_PATTERN, ''))
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
};
const toReleaseEntry = (line: string, isHighlight = false): ReleaseEntry[] => {
  const text = isHighlight ? toHighlightSentence(line) : toReleaseBullet(line);
  return text ? [{ text, shas: commitShas(line) }] : [];
};
/**
 * Player-facing entries for a release body, each with the full commit SHAs it links. The label is
 * used only when the body has no entries at all; a release whose entries are all internal yields
 * none and is hidden.
 */
export const releaseEntries = (body: string | null | undefined, label: string): ReleaseEntry[] => {
  const lines = releaseBulletSources(body);
  if (!lines.length && label) return [{ text: toSentence(label), shas: [] }];
  return lines.flatMap(({ line, highlights }) => toReleaseEntry(line, highlights));
};
/** Player-facing bullet text for a release body; see `releaseEntries`. */
export const releaseBullets = (body: string | null | undefined, label: string): string[] =>
  releaseEntries(body, label).map((entry) => entry.text);
const VERB_PATTERN =
  /^(add|adds|added|fix|fixes|fixed|improve|improves|improved|update|updates|updated|refactor|refactors|refactored)\b\s*/i;
const conventionalBullet = (type: string, scope: string | undefined, subject: string) => {
  const verb = USER_FACING_VERBS[type.toLowerCase()];
  const text = cleanText(subject);
  if (!verb || !text || isInternalScope(scope)) return null;
  return toSentence(`${verb} ${text}`);
};
const inferredBullet = (line: string): string | null => {
  const keyword = line.match(VERB_PATTERN)?.[1]?.toLowerCase();
  const verb = keyword ? INFERRED_MAP[keyword] : undefined;
  if (!verb) return null;
  return toSentence(`${verb} ${cleanText(line.replace(VERB_PATTERN, ''))}`) || null;
};
export const normalizeCommitMessage = (message: string | null | undefined): string | null => {
  const firstLine = message?.split('\n')[0]?.trim();
  if (!firstLine || /^(?:merge|revert)\b/i.test(firstLine)) return null;
  const conventional = firstLine.match(CONVENTIONAL_PATTERN);
  if (!conventional) return inferredBullet(firstLine);
  return conventionalBullet(String(conventional[1]), conventional[2], String(conventional[3]));
};
