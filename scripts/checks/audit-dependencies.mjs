import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// Production dependencies ship with no known advisory at any severity unless it is reviewed and
// accepted here. Each entry names the package, explains why the advisory cannot reach production,
// and expires; an expired or mismatched entry fails so it is re-reviewed, and a stale one warns.
export const ACCEPTED_ADVISORIES = {
  'GHSA-vfj7-8cjw-p6xm': {
    package: 'braces',
    reason:
      'No patched braces release exists (<= 3.0.3). It is reached only through fast-glob in build ' +
      'tooling (nitropack globby, @intlify/unplugin-vue-i18n), which expands repo-controlled glob ' +
      'patterns during the build. It is absent from the deployed .output bundle.',
    expires: '2026-11-03',
  },
  'GHSA-86w9-cpqp-85rv': {
    package: 'node-forge',
    reason:
      'No patched node-forge release exists (<= 1.4.0). It is reached only through listhen, which ' +
      'generates self-signed certificates for the local `nuxt dev` server. It never verifies ' +
      'signatures from untrusted input and is absent from the deployed .output bundle.',
    expires: '2026-11-03',
  },
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Pure verdict for a `pnpm audit --json` report; anything malformed fails closed. */
export function evaluateAudit(report, accepted, today) {
  if (!isRecord(report) || !isRecord(report.advisories)) {
    const detail = isRecord(report) && report.error ? `: ${JSON.stringify(report.error)}` : '';
    return { failures: [`pnpm audit returned no advisory report${detail}`], warnings: [] };
  }
  const failures = [];
  const seen = new Set();
  for (const advisory of Object.values(report.advisories)) {
    const id = advisory?.github_advisory_id || `npm-${advisory?.id}`;
    const name = advisory?.module_name;
    const label = `${id} ${name} ${advisory?.severity} (${advisory?.title})`;
    const entry = accepted[id];
    seen.add(id);
    if (!entry) failures.push(`unaccepted production advisory ${label}`);
    else if (entry.package !== name)
      failures.push(`${id} is accepted for ${entry.package}, not ${name}`);
    else if (!(entry.expires >= today))
      failures.push(`acceptance for ${label} expired ${entry.expires}`);
  }
  const warnings = Object.keys(accepted)
    .filter((id) => !seen.has(id))
    .map((id) => `${id} is no longer reported; remove its acceptance`);
  return { failures, warnings };
}
function main() {
  const run = spawnSync('pnpm', ['audit', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let report;
  try {
    report = run.error || run.signal ? undefined : JSON.parse(run.stdout);
  } catch {
    report = undefined;
  }
  const today = new Date().toISOString().slice(0, 10);
  const { failures, warnings } = evaluateAudit(report, ACCEPTED_ADVISORIES, today);
  for (const warning of warnings) console.log(`::warning title=Dependency audit::${warning}`);
  for (const failure of failures) console.log(`::error title=Dependency audit::${failure}`);
  if (failures.length === 0) console.log('Production dependency audit passed.');
  return failures.length === 0 ? 0 : 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
