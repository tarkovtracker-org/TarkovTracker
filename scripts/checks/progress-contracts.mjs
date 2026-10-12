import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const legacyOwnerSources = ['package.json', 'src'];
const hasLegacyContractsSource = (root) =>
  legacyOwnerSources.some((entry) =>
    existsSync(resolve(root, 'workers/api-gateway/progress-contracts', entry))
  );
export function inspectReleasePins(version, frontend, gateway, lock) {
  const dependency = '@tarkovtracker/progress-contracts';
  const resolution = `resolution: {integrity: ${version.contracts.integrity}, tarball: ${version.contracts.url}}`;
  return [
    frontend.dependencies[dependency] === version.contracts.url ||
      'Frontend contracts pin differs.',
    gateway.dependencies[dependency] === version.contracts.url ||
      'Legacy gateway contracts pin differs.',
    lock.includes(resolution) || 'Contracts URL/integrity differs in pnpm-lock.yaml.',
  ].filter((result) => typeof result === 'string');
}
export function compareCompiledContracts(installed, api) {
  const files = readdirSync(resolve(installed, 'dist')).sort();
  const apiFiles = readdirSync(resolve(api, 'dist')).sort();
  if (JSON.stringify(files) !== JSON.stringify(apiFiles))
    throw new Error('Versioned API and released contracts compiled file sets differ.');
  const compared = files.map((file) => `dist/${file}`);
  compared.push('fixtures/task-failure-branches.json');
  for (const file of compared) {
    if (!readFileSync(resolve(installed, file)).equals(readFileSync(resolve(api, file))))
      throw new Error(
        `Versioned API contracts differ from the released frontend dependency: ${file}`
      );
  }
  return compared;
}
export function checkProgressContracts(root) {
  const version = readJson(resolve(root, 'workers/contract-tests/api-version.json'));
  const violations = inspectReleasePins(
    version,
    readJson(resolve(root, 'package.json')),
    readJson(resolve(root, 'workers/api-gateway/package.json')),
    readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')
  );
  if (hasLegacyContractsSource(root))
    violations.push('Progress rules have a second source owner in the frontend checkout.');
  if (violations.length) throw new Error(violations.join('\n'));
  return version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkProgressContracts(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  console.log('Frontend and legacy gateway use the same immutable contracts URL/integrity.');
}
