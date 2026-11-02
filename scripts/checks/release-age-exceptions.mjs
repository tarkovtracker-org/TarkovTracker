import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyArtifact } from './dependency-artifacts.mjs';
import {
  fetchJson,
  githubPages,
  lockedIntegrity,
  requireEvidence,
} from './dependency-evidence.mjs';
// Seven days remains the default. Exact early releases need an advisory fix, a same-release
// provenance companion, or a required dependency with no mature compatible version. All retain
// publisher/script/advisory screening. Missing npm provenance requires a protected artifact
// attestation whose tarball, release tag and source blob identities are verified before install.
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TITLE = 'Release-age exceptions';
const MIN_POLICY_MINUTES = 7 * 24 * 60;
const parseVersion = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(version).trim());
  return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] ?? '' } : undefined;
};
const releaseRank = (pre) => (pre ? 0 : 1);
const identifierRank = (id) => (/^\d+$/.test(id) ? 0 : 1);
const asciiOrder = (a, b) => (a < b ? -1 : Number(a > b));
// SemVer: numeric identifiers compare numerically and sort before alphanumeric ones (ASCII order).
const compareIdentifier = (a, b) =>
  Math.sign(identifierRank(a) - identifierRank(b)) ||
  (identifierRank(a) === 0 ? Math.sign(Number(a) - Number(b)) : asciiOrder(a, b));
const comparePreIds = (a, b) => {
  const left = a.split('.');
  const right = b.split('.');
  const order = left
    .map((id, index) => (index < right.length ? compareIdentifier(id, right[index]) : 1))
    .find(Boolean);
  return order ?? Math.sign(left.length - right.length);
};
const comparePre = (a, b) => Math.sign(releaseRank(a) - releaseRank(b)) || comparePreIds(a, b);
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
// The comparison order, or undefined when the clause cannot be parsed.
const clauseMatches = (version, clause) => {
  const match = /^\s*(>=|<=|>|<|=)?\s*(\S+)\s*$/.exec(clause);
  const order = match ? compareVersions(version, match[2]) : Number.NaN;
  return Number.isNaN(order) ? undefined : COMPARATORS[match[1] ?? '='](order);
};
/** `version` against a GitHub advisory range (`>= 4.0.0, < 4.6.2`); undefined if unparsable. */
const rangeVerdict = (version, range) => {
  if (typeof range !== 'string' || range.trim() === '') return undefined;
  const clauses = range.split(',').map((clause) => clauseMatches(version, clause));
  return clauses.includes(undefined) ? undefined : clauses.every(Boolean);
};
/** True when `version` satisfies a GitHub advisory range such as `>= 4.0.0, < 4.6.2`. */
export const inAdvisoryRange = (version, range) => rangeVerdict(version, range) === true;
const parseSetting = (json) => (json.trim() === '' ? undefined : JSON.parse(json));
/** Policy from `pnpm config get <key> --json` output, which pnpm prints empty for unset keys. */
export function policyFromConfig(ageJson, excludesJson) {
  const minutes = parseSetting(ageJson);
  const excludes = parseSetting(excludesJson) ?? [];
  return {
    minutes: typeof minutes === 'number' ? minutes : undefined,
    excludes: [excludes].flat().map(String),
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
const normalizeRepository = (url) =>
  String(url ?? '')
    .replace(/\.git$/, '')
    .toLowerCase();
const publishedAt = (packument, version) => Date.parse(packument.time[version] ?? '');
// The latest lower version published before this one; later backports are not its baseline.
const previousVersion = (packument, version) =>
  Object.keys(packument.versions)
    .filter(
      (candidate) =>
        compareVersions(candidate, version) < 0 &&
        publishedAt(packument, candidate) < publishedAt(packument, version)
    )
    .sort((a, b) => publishedAt(packument, b) - publishedAt(packument, a))[0];
const installScripts = (manifest) =>
  INSTALL_SCRIPTS.filter((script) => typeof manifest?.scripts?.[script] === 'string');
const publisherOf = (manifest) => manifest?._npmUser?.name;
const provenanceFailures = (manifest) =>
  manifest.dist?.attestations ? [] : ['has no npm provenance attestation'];
const publisherLabel = (manifest) => publisherOf(manifest) ?? 'an unknown publisher';
// Fails closed: no previous release or no publisher identity cannot prove continuity.
const publisherFailures = (manifest, prior) =>
  publisherOf(manifest) && publisherOf(manifest) === publisherOf(prior)
    ? []
    : [
        `was published by ${publisherLabel(manifest)}, not ${publisherLabel(prior)} (previous release)`,
      ];
const scriptFailures = (manifest, prior) => {
  const added = installScripts(manifest).filter((name) => !installScripts(prior).includes(name));
  if (added.length > 0) return [`adds install scripts: ${added.join(', ')}`];
  const changed = installScripts(manifest).filter(
    (name) => manifest.scripts[name] !== prior?.scripts?.[name]
  );
  return changed.length > 0 ? [`changes install scripts: ${changed.join(', ')}`] : [];
};
/** Supply-chain checks for one published version; returns failure messages. */
export function vetRelease(packument, version, reviewed = false) {
  const manifest = packument.versions[version];
  const prior = packument.versions[previousVersion(packument, version)];
  return [
    ...(reviewed ? [] : provenanceFailures(manifest)),
    ...publisherFailures(manifest, prior),
    ...scriptFailures(manifest, prior),
  ].map((text) => `${packument.name}@${version} ${text}`);
}
const isMature = (packument, version, cutoff) => Date.parse(packument.time[version]) <= cutoff;
const rangesFor = (advisory, name) =>
  (advisory.vulnerabilities ?? []).filter(
    (entry) => entry.package?.ecosystem === 'npm' && entry.package?.name === name
  );
// Fails closed: a range that cannot be evaluated counts as still vulnerable.
const isVulnerable = (ranges, version) =>
  ranges.some((entry) => rangeVerdict(version, entry.vulnerable_version_range) !== false);
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
/** The open advisory for `name` whose ranges include (or cannot clear) `version`, if any. */
const vulnerableUnder = (advisories, name, version) =>
  advisories.find((advisory) => isVulnerable(rangesFor(advisory, name), version));
const advisoryLabel = (advisory) => advisory.ghsa_id || 'an advisory without a GHSA id';
/**
 * The advisory that justifies `version` skipping the release-age window, if any. A version still
 * inside any advisory's vulnerable range is never justified, even when it fixes another one.
 */
export const advisoryFix = (advisories, packument, version, cutoff) =>
  vulnerableUnder(advisories, packument.name, version)
    ? undefined
    : advisories.find(justifiesEarly(packument, version, cutoff))?.ghsa_id;
const UNKNOWN = {
  packument: { name: '', versions: {}, time: {} },
  advisories: [],
  provenance: {},
};
const describeEntry = (raw, lookup) => {
  const { name, version } = parseEntry(raw);
  const { packument, advisories, provenance, reviews = {} } = { ...UNKNOWN, ...lookup[name] };
  const review = reviews[version];
  return {
    raw,
    version,
    packument,
    // Withdrawn advisories neither justify an entry nor mark it vulnerable.
    advisories: advisories.filter((advisory) => !advisory.withdrawn_at),
    repository: normalizeRepository(provenance[version] || review?.repository),
    review,
    published: Date.parse(packument.time[version]),
  };
};
const VERIFY_RULES = [
  (entry) =>
    entry.version
      ? undefined
      : { failures: [`${entry.raw} exempts every version; list exact name@version entries only`] },
  (entry) =>
    entry.packument.versions[entry.version] && !Number.isNaN(entry.published)
      ? undefined
      : { failures: [`${entry.raw} could not be verified against the registry`] },
];
// Supply-chain and advisory screening for every entry still inside the window. Provenance must be
// readable (it names the source repository), not just present in the manifest.
const screeningFailures = (entry) => {
  const vulnerable = vulnerableUnder(entry.advisories, entry.packument.name, entry.version);
  return [
    ...vetRelease(entry.packument, entry.version, entry.review?.verified === true),
    ...(entry.repository ? [] : [`${entry.raw} has no readable npm provenance source repository`]),
    ...(vulnerable
      ? [`${entry.raw} is not cleared by the vulnerable range of ${advisoryLabel(vulnerable)}`]
      : []),
  ];
};
const ADMIT_RULES = [
  (entry, cutoff) =>
    entry.published > cutoff
      ? undefined
      : {
          warnings: [
            `${entry.raw} is past the release-age window; remove it once no younger admitted release needs it`,
          ],
        },
  (entry) => {
    const failures = screeningFailures(entry);
    return failures.length > 0 ? { failures } : undefined;
  },
];
const firstOutcome = (rules, entry, cutoff) =>
  rules.reduce((outcome, rule) => outcome ?? rule(entry, cutoff), undefined);
const fixAt = (entry, cutoff) =>
  advisoryFix(entry.advisories, entry.packument, entry.version, cutoff);
const isCompanion = (entry, fix) =>
  fix.version === entry.version &&
  entry.repository !== '' &&
  fix.repository === entry.repository &&
  Math.abs(fix.published - entry.published) <= DAY_MS;
const justify = (anchors, cutoff) => (entry) => {
  const ghsa = fixAt(entry, cutoff);
  if (ghsa) return { justified: [{ entry: entry.raw, reason: ghsa }] };
  const anchor = anchors.find((fix) => fix.raw !== entry.raw && isCompanion(entry, fix));
  return anchor
    ? { justified: [{ entry: entry.raw, reason: `companion of ${anchor.raw}` }] }
    : {
        failures: [
          `${entry.raw} fixes no open advisory and is not a companion of one; wait for the release-age window`,
        ],
      };
};
function parentOf(entry, described, visited) {
  const review = entry.review ?? {};
  if (![review.verified, review.parent, !visited.has(entry.raw)].every(Boolean)) return undefined;
  const parent = described.find((item) => item.raw === review.parent);
  return screenedParent(parent) ? parent : undefined;
}
const screenedParent = (parent) => parent && screeningFailures(parent).length === 0;
function neededDependency(entry, parent, cutoff) {
  const manifest = parent.packument.versions[parent.version];
  const range = (manifest.dependencies ?? {})[entry.packument.name];
  if (!declaredRange(entry.version, range)) return false;
  return !Object.keys(entry.packument.versions).some((version) =>
    [isMature(entry.packument, version, cutoff), declaredRange(version, range)].every(Boolean)
  );
}
function requiredParent(entry, described, cutoff, windowMs, visited = new Set()) {
  const parent = parentOf(entry, described, visited);
  if (!parent) return false;
  if (!neededDependency(entry, parent, cutoff)) return false;
  visited.add(entry.raw);
  return (
    Boolean(fixAt(parent, parent.published - windowMs)) ||
    requiredParent(parent, described, cutoff, windowMs, visited)
  );
}
// Runtime dependency edges use a deliberately narrow range grammar; unsupported forms fail closed.
export function declaredRange(version, range) {
  const match = /^(\^|~)?(\d+\.\d+\.\d+)$/.exec(range);
  if (!match) return false;
  if (!match[1]) return version === match[2];
  const [major, minor, patch] = match[2].split('.').map(Number);
  const ceiling = match[1] === '~' ? `${major}.${minor + 1}.0` : caretCeiling(major, minor, patch);
  return [compareVersions(version, match[2]) >= 0, compareVersions(version, ceiling) < 0].every(
    Boolean
  );
}
const caretCeiling = (major, minor, patch) => {
  if (major) return `${major + 1}.0.0`;
  return minor ? `0.${minor + 1}.0` : `0.0.${patch + 1}`;
};
const collect = (outcomes, key) => outcomes.flatMap((outcome) => outcome[key] ?? []);
const merge = (outcomes) => ({
  failures: collect(outcomes, 'failures'),
  warnings: collect(outcomes, 'warnings'),
  justified: collect(outcomes, 'justified'),
});
/**
 * Pure verdict for the exclude list. `lookup` maps each entry name to
 * `{ packument, advisories, provenance }` (provenance: version -> source repository URL),
 * `now` is the evaluation time in milliseconds.
 */
export function evaluateExceptions({ minutes, excludes }, lookup, now) {
  if (!(minutes >= MIN_POLICY_MINUTES)) {
    return merge([
      { failures: [`minimumReleaseAge must be at least ${MIN_POLICY_MINUTES} minutes (7 days)`] },
    ]);
  }
  const windowMs = minutes * 60 * 1000;
  const described = excludes.map((raw) => describeEntry(raw, lookup));
  const verifyOutcomes = described.map((entry) => firstOutcome(VERIFY_RULES, entry));
  const verified = described.filter((_, index) => !verifyOutcomes[index]);
  const anchors = verified.filter((entry) => fixAt(entry, entry.published - windowMs));
  const admitted = verified.map(
    (entry) =>
      firstOutcome(ADMIT_RULES, entry, now - windowMs) ??
      (requiredParent(entry, verified, now - windowMs, windowMs)
        ? {
            justified: [
              { entry: entry.raw, reason: `required dependency of ${entry.review.parent}` },
            ],
          }
        : justify(anchors, now - windowMs)(entry))
  );
  return merge([...verifyOutcomes.filter(Boolean), ...admitted]);
}
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1';
const sourceRepository = (attestations) => {
  const slsa = attestations.find((item) => item.predicateType === PROVENANCE_PREDICATE);
  const payload = slsa?.bundle?.dsseEnvelope?.payload;
  const statement = payload ? JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) : {};
  return statement.predicate?.buildDefinition?.externalParameters?.workflow?.repository;
};
// The registry verifies the Sigstore bundle at publish time; an unreadable one counts as none.
async function fetchProvenance(name, version) {
  const url = `https://registry.npmjs.org/-/npm/v1/attestations/${name}@${version}`;
  const body = await fetchJson(url).catch(() => ({ attestations: [] }));
  return [version, sourceRepository(body.attestations ?? [])];
}
async function fetchPackage([name, versions]) {
  const query = new URLSearchParams({
    ecosystem: 'npm',
    affects: name,
    type: 'reviewed',
    is_withdrawn: 'false',
  });
  const packument = await fetchJson(`https://registry.npmjs.org/${name.replaceAll('/', '%2F')}`);
  const advisories = await githubPages(`advisories?${query}`);
  const provenance = await Promise.all(versions.map((version) => fetchProvenance(name, version)));
  return [name, { packument, advisories, provenance: Object.fromEntries(provenance) }];
}
function addReviewChain(entry, selected, records) {
  if (selected.has(entry)) return;
  selected.add(entry);
  const parent = records[entry]?.parent;
  if (parent) addReviewChain(parent, selected, records);
}
/** Mature parents retain live artifact vetting only while an admitted child still needs it. */
export function neededReviews(
  groups,
  lookup,
  now,
  records = artifactReviews,
  windowMs = 7 * DAY_MS
) {
  const selected = new Set();
  for (const [name, versions] of groups) {
    for (const version of versions) {
      const published = Date.parse(lookup[name]?.packument.time[version]);
      if (published > now - windowMs) addReviewChain(`${name}@${version}`, selected, records);
    }
  }
  return selected;
}
async function reviewPackage([name, versions], input, selected) {
  requireEvidence(input, `Could not load ${name} release metadata`);
  const { packument } = input;
  const reviews = await Promise.all(
    versions.map(async (version) => {
      if (!selected.has(`${name}@${version}`)) return [version, undefined];
      const locked = lockedIntegrity(readFileSync('pnpm-lock.yaml', 'utf8'), `${name}@${version}`);
      requireEvidence(
        locked === packument.versions[version]?.dist?.integrity,
        `${name}@${version} locked artifact differs from npm`
      );
      const review = artifactReviews[`${name}@${version}`];
      if (!review) return [version, undefined];
      return [version, await verifyArtifact(review, packument.versions[version])];
    })
  );
  return [
    name,
    {
      ...input,
      packument: { versions: {}, time: {}, ...packument },
      reviews: Object.fromEntries(reviews),
    },
  ];
}
const versionsByName = (excludes) => {
  const entries = excludes.map(parseEntry).filter(({ version }) => version);
  const names = [...new Set(entries.map(({ name }) => name))];
  return names.map((name) => [
    name,
    entries.filter((entry) => entry.name === name).map(({ version }) => version),
  ]);
};
function successfulLookup(settled) {
  for (const { reason } of settled.filter(({ status }) => status === 'rejected')) {
    console.log(`::warning title=${TITLE}::${reason.message}`);
  }
  return Object.fromEntries(settled.filter(({ value }) => value).map(({ value }) => value));
}
async function loadLookup(excludes, windowMs) {
  const groups = versionsByName(excludes);
  const lookup = successfulLookup(await Promise.allSettled(groups.map(fetchPackage)));
  const selected = neededReviews(groups, lookup, Date.now(), artifactReviews, windowMs);
  return successfulLookup(
    await Promise.allSettled(
      groups.map((group) => reviewPackage(group, lookup[group[0]], selected))
    )
  );
}
const reviewFile = new URL('./dependency-reviews.json', import.meta.url);
const artifactReviews = existsSync(reviewFile)
  ? (JSON.parse(readFileSync(reviewFile, 'utf8')).releases ?? {})
  : {};
const pnpmConfig = (key) =>
  execFileSync('pnpm', ['config', 'get', key, '--json'], { encoding: 'utf8' });
export async function checkReleaseAge() {
  const policy = policyFromConfig(
    pnpmConfig('minimumReleaseAge'),
    pnpmConfig('minimumReleaseAgeExclude')
  );
  const lookup = await loadLookup(policy.excludes, policy.minutes * 60_000);
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
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await checkReleaseAge();
