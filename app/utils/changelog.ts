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
// Conventional commit types that describe a change players can notice.
const USER_FACING_TYPES = new Set(['feat', 'fix', 'perf', 'ui']);
// Scopes for tooling, automation, documentation, and dependencies. A `fix(ci):` commit is still
// internal even though its type would otherwise be user-facing.
const INTERNAL_SCOPES = new Set([
  'agents',
  'build',
  'ci',
  'config',
  'deps',
  'deps-dev',
  'docs',
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
const RELEASE_CLOSES_PATTERN = /,?\s*closes\b.*$/i;
const RELEASE_COMMIT_PATTERN = /\/commit\/([0-9a-f]{40})\b/gi;
const isInternalScope = (scope: string | undefined): boolean =>
  Boolean(scope) && INTERNAL_SCOPES.has(String(scope).trim().toLowerCase());
const isText = (value: string | null): value is string => Boolean(value);
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
export const extractReleaseBullets = (body: string | null | undefined): string[] => {
  if (!body) return [];
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));
  const sourceLines = bulletLines.length
    ? bulletLines
    : lines.filter((line) => !line.startsWith('#'));
  return sourceLines
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
    .filter(Boolean);
};
/** Player-facing sentence for one semantic-release entry, or null for internal/empty entries. */
export const toReleaseBullet = (line: string): string | null => {
  if (isInternalScope(line.match(RELEASE_SCOPE_PATTERN)?.[1])) return null;
  const subject = line
    .replace(RELEASE_SCOPE_PATTERN, '')
    .replace(RELEASE_CLOSES_PATTERN, '')
    .replace(RELEASE_REFERENCE_PATTERN, '');
  return toSentence(subject) || null;
};
/**
 * Player-facing bullets for a release body. The label is used only when the body has no entries
 * at all; a release whose entries are all internal yields no bullets and is hidden.
 */
export const releaseBullets = (body: string | null | undefined, label: string): string[] => {
  const lines = extractReleaseBullets(body);
  if (!lines.length && label) return [toSentence(label)];
  return lines.map(toReleaseBullet).filter(isText);
};
/** Full commit SHAs linked from a release body, used to avoid listing a change twice. */
export const releaseCommitShas = (body: string | null | undefined): string[] =>
  Array.from((body ?? '').matchAll(RELEASE_COMMIT_PATTERN), (match) =>
    String(match[1]).toLowerCase()
  );
const VERB_PATTERN =
  /^(add|adds|added|fix|fixes|fixed|improve|improves|improved|update|updates|updated|refactor|refactors|refactored)\b\s*/i;
const conventionalBullet = (type: string, scope: string | undefined, subject: string) => {
  if (!USER_FACING_TYPES.has(type.toLowerCase()) || isInternalScope(scope)) return null;
  return toSentence(subject) || null;
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
