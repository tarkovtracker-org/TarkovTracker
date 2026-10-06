import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// Production dependencies ship with no known advisory at any severity unless it is reviewed and
// accepted here. Each entry names the package, the complete reviewed dependency chains (`via`,
// matched exactly after the leading importer segment), why the advisory cannot reach production,
// and an expiry. An expired or mismatched entry, or a finding on any other path, fails so it is
// re-reviewed; a stale one warns.
export const ACCEPTED_ADVISORIES = {
  'GHSA-vfj7-8cjw-p6xm': {
    package: 'braces',
    via: [
      '@nuxtjs/i18n>@intlify/unplugin-vue-i18n>fast-glob>micromatch>braces',
      '@nuxtjs/sitemap>nuxt-site-config>nuxtseo-shared>nuxt>@nuxt/nitro-server>nitropack>globby>fast-glob>micromatch>braces',
      '@nuxtjs/sitemap>nuxtseo-shared>nuxt>@nuxt/nitro-server>nitropack>globby>fast-glob>micromatch>braces',
      'nuxt>@nuxt/nitro-server>nitropack>globby>fast-glob>micromatch>braces',
    ],
    reason:
      'No patched braces release exists (<= 3.0.3). It is reached only through fast-glob in build ' +
      'tooling (nitropack globby, @intlify/unplugin-vue-i18n), which expands repo-controlled glob ' +
      'patterns during the build. It is absent from the deployed .output bundle.',
    expires: '2026-11-03',
  },
  'GHSA-86w9-cpqp-85rv': {
    package: 'node-forge',
    via: [
      '@nuxtjs/sitemap>nuxt-site-config>nuxtseo-shared>nuxt>@nuxt/cli>listhen>node-forge',
      '@nuxtjs/sitemap>nuxt-site-config>nuxtseo-shared>nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge',
      '@nuxtjs/sitemap>nuxtseo-shared>nuxt>@nuxt/cli>listhen>node-forge',
      '@nuxtjs/sitemap>nuxtseo-shared>nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge',
      'nuxt>@nuxt/cli>listhen>node-forge',
      'nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge',
    ],
    reason:
      'No patched node-forge release exists (<= 1.4.0). It is reached only through listhen, which ' +
      'generates self-signed certificates for the local `nuxt dev` server. It never verifies ' +
      'signatures from untrusted input and is absent from the deployed .output bundle.',
    expires: '2026-11-03',
  },
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asList = (value) => (Array.isArray(value) ? value : []);
const asRecord = (value) => (isRecord(value) ? value : {});
// pnpm prefixes each path with its importer (`.` for the root); everything after it must match.
const chainOf = (path) => (typeof path === 'string' ? path.split('>').slice(1).join('>') : '');
const isReviewed = (path, via) => via.includes(chainOf(path));
const findingPaths = (finding) => {
  const paths = asList(asRecord(finding).paths);
  return paths.length > 0 ? paths : ['(no dependency path reported)'];
};
// Paths that the entry has not reviewed; a finding without paths counts as unreviewed.
function unreviewedPaths(advisory, entry) {
  const findings = asList(advisory.findings);
  if (findings.length === 0) return ['(no dependency path reported)'];
  const via = asList(entry.via);
  return findings.flatMap(findingPaths).filter((path) => !isReviewed(path, via));
}
function describe(raw) {
  const advisory = asRecord(raw);
  const id = advisory.github_advisory_id || `npm-${advisory.id}`;
  const name = advisory.module_name;
  return { advisory, id, name, label: `${id} ${name} ${advisory.severity} (${advisory.title})` };
}
function acceptanceFailures({ advisory, id, name, label }, entry, today) {
  if (!entry) return [`unaccepted production advisory ${label}`];
  if (entry.package !== name) return [`${id} is accepted for ${entry.package}, not ${name}`];
  if (!(entry.expires >= today)) return [`acceptance for ${label} expired ${entry.expires}`];
  return unreviewedPaths(advisory, entry).map(
    (path) => `${id} reaches ${name} through an unreviewed path: ${path}`
  );
}
function malformedReport(report) {
  const detail = isRecord(report) && report.error ? `: ${JSON.stringify(report.error)}` : '';
  return { failures: [`pnpm audit returned no advisory report${detail}`], warnings: [] };
}
/** Pure verdict for a `pnpm audit --json` report; anything malformed fails closed. */
export function evaluateAudit(report, accepted, today) {
  if (!isRecord(report) || !isRecord(report.advisories)) return malformedReport(report);
  const found = Object.values(report.advisories).map(describe);
  const seen = new Set(found.map(({ id }) => id));
  const failures = found.flatMap((finding) =>
    acceptanceFailures(finding, accepted[finding.id], today)
  );
  const warnings = Object.keys(accepted)
    .filter((id) => !seen.has(id))
    .map((id) => `${id} is no longer reported; remove its acceptance`);
  return { failures, warnings };
}
function readReport() {
  const run = spawnSync('pnpm', ['audit', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (run.error || run.signal) return undefined;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return undefined;
  }
}
function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { failures, warnings } = evaluateAudit(readReport(), ACCEPTED_ADVISORIES, today);
  const annotations = [
    ...warnings.map((text) => `::warning title=Dependency audit::${text}`),
    ...failures.map((text) => `::error title=Dependency audit::${text}`),
  ];
  for (const annotation of annotations) console.log(annotation);
  if (failures.length > 0) return 1;
  console.log('Production dependency audit passed.');
  return 0;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
