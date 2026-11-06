import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const DAY_MS = 86_400_000;
export const SHA = /^[a-f0-9]{40}$/;
export function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function requestOnce(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (response.ok) return response;
  const error = new Error(`${url} returned ${response.status}`);
  error.retryable = [429, 500, 502, 503, 504].includes(response.status);
  throw error;
}
const retryableError = (error) =>
  error.retryable ?? ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name);
export async function fetchResponse(url, options = {}, attempt = 0) {
  try {
    return await requestOnce(url, options);
  } catch (error) {
    if (![retryableError(error), attempt < 2].every(Boolean))
      throw new Error(`${url}: ${error.message}`, { cause: error });
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    return fetchResponse(url, options, attempt + 1);
  }
}
export async function fetchJson(url, headers = {}) {
  const response = await fetchResponse(url, { headers });
  return response.json();
}
export async function githubJson(path) {
  requireEvidence(!path.includes('..'), 'Invalid GitHub API path');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    return fetchJson(`https://api.github.com/${path}`, {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    });
  }
  // Local development uses the existing authenticated CLI without reading its credentials.
  return JSON.parse(
    execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 })
  );
}
const pagePath = (path, page) =>
  `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`;
export async function githubPages(path, field, request = githubJson) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const response = await request(pagePath(path, page));
    const items = field ? response[field] : response;
    requireEvidence(Array.isArray(items), 'Malformed paginated GitHub response');
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('GitHub evidence exceeded the pagination bound');
}
/** Only canonical pnpm-generated npm resolution stanzas are eligible for early admission. */
export function lockedIntegrity(lock, entry) {
  requireEvidence(
    lock.match(/^packages:\r?$/gm)?.length === 1,
    'Ambiguous pnpm package resolution table'
  );
  const packages = lock.split(/^packages:\r?\n/m)[1]?.split(/^snapshots:\r?\n/m)[0];
  requireEvidence(typeof packages === 'string', 'Missing pnpm package resolution table');
  const headers = [`  ${entry}:`, `  '${entry}':`, `  "${entry}":`];
  const lines = packages.split(/\r?\n/);
  const matches = lines.flatMap((line, index) => (headers.includes(line) ? [index] : []));
  requireEvidence(matches.length <= 1, `Ambiguous early resolution: ${entry}`);
  const at = matches[0] ?? -1;
  requireEvidence(at >= 0, `Reviewed exception is not locked: ${entry}`);
  const resolution = lines[at + 1]?.match(
    /^ {4}resolution: \{integrity: (sha512-[A-Za-z0-9+/]+=*)\}$/
  );
  requireEvidence(resolution, `Unsupported or non-registry early resolution: ${entry}`);
  return resolution[1];
}
export function evidenceDates(review, now) {
  const reviewed = Date.parse(review?.reviewedAt);
  const expires = Date.parse(review?.expires);
  return [
    Number.isFinite(reviewed),
    Number.isFinite(expires),
    reviewed <= now,
    expires > now,
    expires - reviewed <= 30 * DAY_MS,
  ].every(Boolean);
}
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'packageManager',
  'engines',
];
function canonical(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])])
  );
}
export const comparisonDigest = (comparison) =>
  sha256(
    JSON.stringify(canonical(comparison.toSorted((a, b) => a.file.localeCompare(b.file, 'en'))))
  );
export function dependencyFingerprint(manifest, lock) {
  const fields = Object.fromEntries(DEPENDENCY_FIELDS.map((key) => [key, manifest[key] ?? null]));
  return sha256(JSON.stringify(canonical(fields)) + '\n' + lock);
}
export async function remoteDependencies(repository, commit) {
  requireEvidence(SHA.test(commit), 'Socket evidence must name an immutable commit');
  const read = async (path) => {
    let file = await githubJson(`repos/${repository}/contents/${path}?ref=${commit}`);
    if (!file.content && file.sha)
      file = await githubJson(`repos/${repository}/git/blobs/${file.sha}`);
    requireEvidence(
      file.encoding === 'base64' && typeof file.content === 'string',
      `Unreadable ${path}`
    );
    return Buffer.from(file.content, 'base64').toString('utf8');
  };
  const [manifest, lock] = await Promise.all([read('package.json'), read('pnpm-lock.yaml')]);
  return { manifest: JSON.parse(manifest), lock };
}
export async function remoteFingerprint(repository, commit) {
  const input = await remoteDependencies(repository, commit);
  return dependencyFingerprint(input.manifest, input.lock);
}
function lockLines(lock, section) {
  const lines = lock.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => (line === `${section}:` ? [index] : []));
  requireEvidence(starts.length <= 1, `Ambiguous ${section} table`);
  if (!starts.length) return [];
  const body = [];
  for (const line of lines.slice(starts[0] + 1)) {
    if (/^\S/.test(line)) break;
    body.push(line);
  }
  return body;
}
function indentedBlocks(lines, indent) {
  return lines
    .join('\n')
    .split(new RegExp(`(?=^ {${indent}}\\S)`, 'm'))
    .map((block) => block.trimEnd())
    .filter((block) => block.trim());
}
const lockBlocks = (lock, section) => indentedBlocks(lockLines(lock, section), 2);
const LOCK_HEADERS =
  /^(?:lockfileVersion: '9\.0'|(?:settings|overrides|patchedDependencies|importers|packages|snapshots):|packageExtensionsChecksum: sha256-\S+)$/;
function canonicalLock(lock) {
  requireEvidence(!/^\s*#|\t/m.test(lock), 'Noncanonical lockfile comments or tabs');
  const headers = lock.split('\n').filter((line) => /^\S/.test(line));
  requireEvidence(
    headers.every((line) => LOCK_HEADERS.test(line)),
    'Noncanonical lockfile header'
  );
  const keys = headers.map((line) => line.split(':')[0]);
  requireEvidence(new Set(keys).size === keys.length, 'Ambiguous lockfile table');
  requireEvidence(
    ['lockfileVersion', 'importers', 'packages', 'snapshots'].every((key) => keys.includes(key)),
    'Missing lockfile table'
  );
}
const IMPORTER_LINE =
  /^(?: {2}\.:| {4}(?:dependencies|devDependencies|optionalDependencies):| {6}\S.*:| {8}(?:specifier|version): \S.*)$/;
function importerBlocks(lock, section) {
  const lines = lockLines(lock, 'importers');
  requireEvidence(
    lines.filter((line) => line.trim()).every((line) => IMPORTER_LINE.test(line)),
    'Noncanonical importer declaration'
  );
  requireEvidence(
    lines.filter((line) => /^ {2}\S/.test(line)).join('\n') === '  .:',
    'Queue composition supports the single root importer only'
  );
  const groups = lines.filter((line) => /^ {4}\S/.test(line));
  requireEvidence(new Set(groups).size === groups.length, 'Ambiguous importer declaration');
  requireEvidence(
    groups.every((line) =>
      /^ {4}(?:dependencies|devDependencies|optionalDependencies):$/.test(line)
    ),
    'Unknown importer declaration'
  );
  const start = lines.indexOf(`    ${section}:`);
  if (start < 0) return [];
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {4}\S/.test(line)) break;
    body.push(line);
  }
  return indentedBlocks(body, 6);
}
function coveredField(actual, sources) {
  if (![Boolean(actual), typeof actual === 'object'].every(Boolean))
    return sources.includes(actual);
  if (Object.keys(actual).length === 0)
    return sources.some((source) => JSON.stringify(source) === JSON.stringify(actual));
  return Object.entries(actual).every(([key, value]) =>
    sources.some(
      (source) => JSON.stringify(canonical(source?.[key])) === JSON.stringify(canonical(value))
    )
  );
}
const coveredManifest = (candidate, sources) =>
  DEPENDENCY_FIELDS.every((field) =>
    coveredField(
      candidate[field],
      sources.map((source) => source[field])
    )
  );
function coveredBlocks(candidate, sources, section, extract) {
  const allowed = new Set(sources.flatMap((input) => extract(input.lock, section)));
  return extract(candidate.lock, section).every((block) => allowed.has(block));
}
function lockKey(block) {
  const match = /^(?:'([^']+)'|"([^"]+)"|([^:'"]+)):\s*(?:\{\})?$/.exec(
    block.split('\n')[0].trim()
  );
  requireEvidence(match, 'Unsupported lockfile entry key');
  return match.slice(1).find(Boolean);
}
function pairedBlocks(input) {
  const artifacts = new Map(
    lockBlocks(input.lock, 'packages').map((block) => [lockKey(block), block])
  );
  return lockBlocks(input.lock, 'snapshots').map((snapshot) => {
    const key = lockKey(snapshot).replace(/\(.*/, '');
    const artifact = artifacts.get(key);
    requireEvidence(artifact, 'Snapshot has no matching artifact');
    return `${artifact}\n${snapshot}`;
  });
}
function coveredPairs(candidate, sources) {
  const allowed = new Set(sources.flatMap(pairedBlocks));
  return pairedBlocks(candidate).every((pair) => allowed.has(pair));
}
/** A queue may combine independently reviewed updates, but cannot invent an artifact or patch. */
export function reviewedComposition(candidate, base, reviewed) {
  const sources = [base, reviewed];
  [candidate, ...sources].forEach((input) => canonicalLock(input.lock));
  const coverage = [
    coveredPairs(candidate, sources),
    coveredManifest(
      candidate.manifest,
      sources.map((input) => input.manifest)
    ),
    ...['packages', 'snapshots', 'patchedDependencies', 'overrides'].map((section) =>
      coveredBlocks(candidate, sources, section, lockBlocks)
    ),
    ...['dependencies', 'devDependencies', 'optionalDependencies'].map((section) =>
      coveredBlocks(candidate, sources, section, importerBlocks)
    ),
    ...['settings', 'packageExtensionsChecksum', 'lockfileVersion'].map((section) =>
      coveredBlocks(candidate, sources, section, (lock) =>
        indentedBlocks(lock.split('\n'), 0).filter((block) => block.startsWith(`${section}:`))
      )
    ),
    lockBlocks(candidate.lock, 'packages').length > 0,
  ];
  return coverage.every(Boolean);
}
