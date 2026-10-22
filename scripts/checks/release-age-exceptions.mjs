import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// `minimumReleaseAge` in pnpm-workspace.yaml holds every new version back for 7 days. A version
// may skip the wait only through an exact `name@version` entry in `minimumReleaseAgeExclude`
// that this check justifies:
// - advisory fix: a reviewed GitHub advisory for the package lists a first patched version in the
//   same major line at or below the entry, the entry is outside every vulnerable range, and no
//   patched version in that line has already aged past the window (so a mature fix is not
//   skipped over);
// - companion: same repository and same version as an advisory-fix entry, published within a day
//   of it (monorepo siblings such as @nuxt/kit with nuxt).
// Every entry must also carry npm provenance, come from the previous release's publisher, and add
// no install scripts. Name patterns and unjustified entries fail; entries that have aged past the
// window warn so they are removed.
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const EXCLUDE_ITEM = /^\s+-\s+(['"]?)(.+?)\1\s*$/;
const TITLE = 'Release-age exceptions';
const parseVersion = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(version).trim());
  return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] ?? '' } : undefined;
};
const releaseRank = (pre) => (pre ? 0 : 1);
const comparePre = (a, b) =>
  Math.sign(releaseRank(a) - releaseRank(b)) ||
  Math.sign(a.localeCompare(b, undefined, { numeric: true }));
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return Number.NaN;
  const core = a.parts.map((part, index) => Math.sign(part - b.parts[index])).find(Boolean);
  return core ?? comparePre(a.pre, b.pre);
}
const majorOf = (version) => parseVersion(version)?.parts[0];
const COMPARATORS = {
  '>=': (order) => order >= 0,
  '>': (order) => order > 0,
  '<=': (order) => order <= 0,
  '<': (order) => order < 0,
  '=': (order) => order === 0,
};
const clauseMatches = (version, clause) => {
  const match = /^\s*(>=|<=|>|<|=)?\s*(\S+)\s*$/.exec(clause);
  const order = match ? compareVersions(version, match[2]) : Number.NaN;
  return !Number.isNaN(order) && COMPARATORS[match[1] ?? '='](order);
};
/** True when `version` satisfies a GitHub advisory range such as `>= 4.0.0, < 4.6.2`. */
export const inAdvisoryRange = (version, range) =>
  typeof range === 'string' &&
  range.trim() !== '' &&
  range.split(',').every((clause) => clauseMatches(version, clause));
/** Reads `minimumReleaseAge` (minutes) and its exclude list from pnpm-workspace.yaml text. */
export function parseWorkspacePolicy(text) {
  const lines = text.split(/\r?\n/);
  const age = /^minimumReleaseAge:\s*(\d+)\s*$/m.exec(text);
  const start = lines.findIndex((line) => /^minimumReleaseAgeExclude:\s*$/.test(line));
  const following = start < 0 ? [] : lines.slice(start + 1);
  const end = following.findIndex((line) => !EXCLUDE_ITEM.test(line));
  const items = following.slice(0, end < 0 ? undefined : end);
  return {
    minutes: age ? Number(age[1]) : undefined,
    excludes: items.map((line) => EXCLUDE_ITEM.exec(line)[2]),
  };
}
/** Splits `name@version` (scoped or not); anything else is a pattern without a version. */
export function parseEntry(entry) {
  const at = entry.lastIndexOf('@');
  const version = at > 0 ? entry.slice(at + 1) : '';
  return EXACT_VERSION.test(version)
    ? { name: entry.slice(0, at), version }
    : { name: entry, version: undefined };
}
const normalizeRepository = (repository) => {
  const url = typeof repository === 'string' ? repository : repository?.url;
  return String(url ?? '')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .toLowerCase();
};
const previousVersion = (packument, version) =>
  Object.keys(packument.versions)
    .filter((candidate) => packument.time[candidate] && compareVersions(candidate, version) < 0)
    .sort((a, b) => Date.parse(packument.time[b]) - Date.parse(packument.time[a]))[0];
const installScripts = (manifest) =>
  INSTALL_SCRIPTS.filter((script) => typeof manifest?.scripts?.[script] === 'string');
const publisherOf = (manifest) => manifest?._npmUser?.name;
const provenanceFailures = (manifest) =>
  manifest.dist?.attestations ? [] : ['has no npm provenance attestation'];
const publisherFailures = (manifest, prior) =>
  !prior || publisherOf(prior) === publisherOf(manifest)
    ? []
    : [`was published by ${publisherOf(manifest)}, not ${publisherOf(prior)} (previous release)`];
const scriptFailures = (manifest, prior) => {
  const added = installScripts(manifest).filter((name) => !installScripts(prior).includes(name));
  return added.length > 0 ? [`adds install scripts: ${added.join(', ')}`] : [];
};
/** Supply-chain checks for one published version; returns failure messages. */
export function vetRelease(packument, version) {
  const manifest = packument.versions[version];
  const prior = packument.versions[previousVersion(packument, version)];
  return [
    ...provenanceFailures(manifest),
    ...publisherFailures(manifest, prior),
    ...scriptFailures(manifest, prior),
  ].map((text) => `${packument.name}@${version} ${text}`);
}
const isMature = (packument, version, cutoff) => Date.parse(packument.time[version]) <= cutoff;
const rangesFor = (advisory, name) =>
  (advisory.vulnerabilities ?? []).filter(
    (entry) => entry.package?.ecosystem === 'npm' && entry.package?.name === name
  );
const isVulnerable = (ranges, version) =>
  ranges.some((entry) => inAdvisoryRange(version, entry.vulnerable_version_range));
const patchedAtOrBelow = (ranges, version) =>
  ranges
    .map((entry) => entry.first_patched_version)
    .find(
      (patched) =>
        patched && majorOf(patched) === majorOf(version) && compareVersions(patched, version) <= 0
    );
const isStableInLine = (candidate, patched) =>
  majorOf(candidate) === majorOf(patched) &&
  !parseVersion(candidate).pre &&
  compareVersions(candidate, patched) >= 0;
const isMatureFix = (packument, ranges, patched, cutoff) => (candidate) =>
  isStableInLine(candidate, patched) &&
  !isVulnerable(ranges, candidate) &&
  isMature(packument, candidate, cutoff);
const justifiesEarly = (packument, version, cutoff) => (advisory) => {
  const ranges = rangesFor(advisory, packument.name);
  const patched = isVulnerable(ranges, version) ? undefined : patchedAtOrBelow(ranges, version);
  const versions = Object.keys(packument.versions);
  return Boolean(patched) && !versions.some(isMatureFix(packument, ranges, patched, cutoff));
};
/** The advisory that justifies `version` skipping the release-age window, if any. */
export const advisoryFix = (advisories, packument, version, cutoff) =>
  advisories.find(justifiesEarly(packument, version, cutoff))?.ghsa_id;
const UNKNOWN = { packument: { name: '', versions: {}, time: {} }, advisories: [] };
const describeEntry = (raw, lookup) => {
  const { name, version } = parseEntry(raw);
  const { packument, advisories } = lookup[name] ?? UNKNOWN;
  return { raw, version, packument, advisories, published: Date.parse(packument.time[version]) };
};
const RULES = [
  (entry) =>
    entry.version
      ? undefined
      : { failures: [`${entry.raw} exempts every version; list exact name@version entries only`] },
  (entry) =>
    entry.packument.versions[entry.version] && !Number.isNaN(entry.published)
      ? undefined
      : { failures: [`${entry.raw} could not be verified against the registry`] },
  (entry, cutoff) =>
    entry.published > cutoff
      ? undefined
      : { warnings: [`${entry.raw} is past the release-age window; remove it from the excludes`] },
  (entry) => {
    const failures = vetRelease(entry.packument, entry.version);
    return failures.length > 0 ? { failures } : undefined;
  },
];
const screen = (entry, cutoff) =>
  RULES.reduce((outcome, rule) => outcome ?? rule(entry, cutoff), undefined) ?? {
    candidate: entry,
  };
const withAdvisory = (cutoff) => (entry) => ({
  ...entry,
  ghsa: advisoryFix(entry.advisories, entry.packument, entry.version, cutoff),
});
const repositoryOf = (entry) =>
  normalizeRepository(entry.packument.versions[entry.version].repository);
const isCompanion = (entry, fix) =>
  fix.version === entry.version &&
  repositoryOf(entry) !== '' &&
  repositoryOf(fix) === repositoryOf(entry) &&
  Math.abs(fix.published - entry.published) <= DAY_MS;
const justify = (fixes) => (entry) => {
  if (entry.ghsa) return { justified: [{ entry: entry.raw, reason: entry.ghsa }] };
  const anchor = fixes.find((fix) => isCompanion(entry, fix));
  return anchor
    ? { justified: [{ entry: entry.raw, reason: `companion of ${anchor.raw}` }] }
    : {
        failures: [
          `${entry.raw} fixes no open advisory and is not a companion of one; wait for the release-age window`,
        ],
      };
};
const collect = (outcomes, key) => outcomes.flatMap((outcome) => outcome[key] ?? []);
const merge = (outcomes) => ({
  failures: collect(outcomes, 'failures'),
  warnings: collect(outcomes, 'warnings'),
  justified: collect(outcomes, 'justified'),
});
/**
 * Pure verdict for the exclude list. `lookup` maps each entry name to
 * `{ packument, advisories }`, `now` is the evaluation time in milliseconds.
 */
export function evaluateExceptions({ minutes, excludes }, lookup, now) {
  if (excludes.length > 0 && !(minutes > 0)) {
    return merge([{ failures: ['minimumReleaseAge is not set; excludes have nothing to bypass'] }]);
  }
  const cutoff = now - minutes * 60 * 1000;
  const screened = excludes.map((raw) => screen(describeEntry(raw, lookup), cutoff));
  const candidates = collect(screened, 'candidate').map(withAdvisory(cutoff));
  const fixes = candidates.filter((entry) => entry.ghsa);
  return merge([...screened, ...candidates.map(justify(fixes))]);
}
async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}
const ADVISORY_HEADERS = {
  Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
async function fetchPackage(name) {
  const query = new URLSearchParams({
    ecosystem: 'npm',
    affects: name,
    type: 'reviewed',
    per_page: '100',
  });
  const packument = await fetchJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
  const advisories = await fetchJson(
    `https://api.github.com/advisories?${query}`,
    ADVISORY_HEADERS
  );
  return [name, { packument: { versions: {}, time: {}, ...packument }, advisories }];
}
async function loadLookup(names) {
  const settled = await Promise.allSettled(names.map(fetchPackage));
  for (const { reason } of settled.filter(({ status }) => status === 'rejected')) {
    console.log(`::warning title=${TITLE}::${reason.message}`);
  }
  return Object.fromEntries(settled.filter(({ value }) => value).map(({ value }) => value));
}
async function main() {
  const policy = parseWorkspacePolicy(readFileSync('pnpm-workspace.yaml', 'utf8'));
  const names = [...new Set(policy.excludes.map((entry) => parseEntry(entry).name))];
  const lookup = await loadLookup(names);
  const { failures, warnings, justified } = evaluateExceptions(policy, lookup, Date.now());
  const lines = [
    ...justified.map(({ entry, reason }) => `${entry}: ${reason}`),
    ...warnings.map((text) => `::warning title=${TITLE}::${text}`),
    ...failures.map((text) => `::error title=${TITLE}::${text}`),
  ];
  for (const line of lines) console.log(line);
  if (failures.length === 0) console.log('Release-age exceptions check passed.');
  return failures.length > 0 ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
