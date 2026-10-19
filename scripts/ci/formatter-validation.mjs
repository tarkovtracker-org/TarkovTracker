// Deliberately narrow: only a leaf Prettier resolution refresh, with its existing formatter
// plugin peer rebound. Every other byte of the manifest and lockfile must remain unchanged.
import { safeVersion } from './review-admission-version.mjs';
const SHA = /^[a-f0-9]{40}$/;
const VERSION = '(\\d+\\.\\d+\\.\\d+)';
function exactlyOne(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Ambiguous formatter lock shape');
  return matches[0];
}
function manifestIsFormatterOnly(before, after) {
  if (before !== after) return false;
  const { dependencies = {}, devDependencies = {} } = JSON.parse(before);
  return [
    typeof devDependencies.prettier === 'string',
    typeof devDependencies['prettier-plugin-tailwindcss'] === 'string',
    !Object.hasOwn(dependencies, 'prettier'),
    !Object.hasOwn(dependencies, 'prettier-plugin-tailwindcss'),
  ].every(Boolean);
}
function replaceOnce(text, pattern, replacement) {
  exactlyOne(text, pattern);
  return text.replace(pattern, replacement);
}
function formatterImporter(text) {
  // A single root importer prevents another workspace's runtime dependency from being hidden.
  const importers = exactlyOne(text, /^importers:\n([\s\S]*?)^packages:\n/gm)[1];
  if (!/^\n  \.:\n/.test(importers)) throw new Error('Unknown root importer');
  if ([...importers.matchAll(/^ {2}\S.*:$/gm)].length !== 1)
    throw new Error('Additional lock importer');
  exactlyOne(importers, /^      prettier:$/gm);
  exactlyOne(importers, /^      prettier-plugin-tailwindcss:$/gm);
  const dev = exactlyOne(importers, /^ {4}devDependencies:\n([\s\S]*)/gm)[1];
  const match = exactlyOne(
    dev,
    new RegExp(
      `^      prettier:\\n        specifier: ([^\\n]+)\\n        version: ${VERSION}$`,
      'gm'
    )
  );
  return { version: match[2], importer: match[0] };
}
function normaliseFormatterLock(text) {
  if (!completeLockText(text)) throw new Error('Unreadable lockfile');
  const { version, importer } = formatterImporter(text);
  const escaped = version.replaceAll('.', '\\.');
  let result = text.replace(importer, importer.replace(/version: \S+$/, 'version: #FORMATTER#'));
  result = replaceOnce(
    result,
    new RegExp(`^(        version: [0-9.]+\\(prettier@)${escaped}(\\))$`, 'gm'),
    '$1#FORMATTER#$2'
  );
  result = replaceOnce(
    result,
    new RegExp(
      `^  prettier@${escaped}:\\n    resolution: \\{integrity: sha512-[A-Za-z0-9+/]{86}==\\}`,
      'gm'
    ),
    '  prettier@#FORMATTER#:\n    resolution: {integrity: #FORMATTER#}'
  );
  result = replaceOnce(
    result,
    new RegExp(`^(  prettier-plugin-tailwindcss@[0-9.]+\\(prettier@)${escaped}(\\):)$`, 'gm'),
    '$1#FORMATTER#$2'
  );
  result = replaceOnce(
    result,
    new RegExp(`^      prettier: ${escaped}$`, 'gm'),
    '      prettier: #FORMATTER#'
  );
  result = replaceOnce(
    result,
    new RegExp(`^  prettier@${escaped}: \\{\\}$`, 'gm'),
    '  prettier@#FORMATTER#: {}'
  );
  // No other resolved package may use the formatter: this is a tooling-only leaf closure.
  if (/prettier@[0-9]|^ +prettier: [0-9]/m.test(result))
    throw new Error('Other formatter consumer');
  return { version, text: result };
}
export function formatterOnlyChange(before, after) {
  try {
    if (!manifestIsFormatterOnly(before.manifest, after.manifest)) return false;
    const old = normaliseFormatterLock(before.lock);
    const next = normaliseFormatterLock(after.lock);
    return [
      old.version !== next.version,
      safeVersion(old.version, next.version),
      old.text === next.text,
    ].every(Boolean);
  } catch {
    return false;
  }
}
export function formatterPaths(paths) {
  return paths.length === 1 && paths[0] === 'pnpm-lock.yaml';
}
async function immutableContent(github, repo, ref, path) {
  const { data } = await github.rest.repos.getContent({ ...repo, ref, path });
  if (![data.type === 'file', data.encoding === 'base64', data.size <= 1000000].every(Boolean))
    throw new Error('Incomplete immutable formatter input');
  const bytes = Buffer.from(data.content, 'base64');
  if (bytes.length !== data.size) throw new Error('Truncated immutable formatter input');
  return bytes.toString('utf8');
}
async function immutableInputs(github, repo, ref) {
  return {
    manifest: await immutableContent(github, repo, ref, 'package.json'),
    lock: await immutableContent(github, repo, ref, 'pnpm-lock.yaml'),
  };
}
export async function verifiedFormatterChange(github, repo, base, head, paths) {
  if (!formatterPaths(paths)) return false;
  if (![base, head].every((sha) => SHA.test(sha))) return false;
  try {
    const before = await immutableInputs(github, repo, base);
    const after = await immutableInputs(github, repo, head);
    return formatterOnlyChange(before, after);
  } catch {
    // Missing, malformed, inaccessible, or incomplete evidence always requires full validation.
    return false;
  }
}
function completeLockText(text) {
  if (typeof text !== 'string') return false;
  return [
    Buffer.byteLength(text) <= 1000000,
    !text.includes('\r'),
    text.endsWith('\n'),
    text.startsWith("lockfileVersion: '9.0'\n"),
    // Reject duplicate section headers before the bounded section extraction.
    [...text.matchAll(/^importers:$/gm)].length === 1,
    [...text.matchAll(/^packages:$/gm)].length === 1,
    [...text.matchAll(/^snapshots:$/gm)].length === 1,
  ].every(Boolean);
}
