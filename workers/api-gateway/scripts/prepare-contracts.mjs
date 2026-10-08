import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const gateway = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fingerprint = (files) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        files.map((file) => [file, existsSync(file) ? readFileSync(file, 'utf8') : null])
      )
    )
    .digest('hex');
function readStamp(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
// Packed installs already contain compiled exports. Only this preparatory workspace has a
// sibling source owner; its cache is outside the published files and detects edited outputs too.
export function prepareWorkspaceContracts(gatewayRoot = gateway) {
  const contracts = resolve(gatewayRoot, 'progress-contracts');
  const manifestPath = resolve(contracts, 'package.json');
  if (!existsSync(manifestPath)) return false;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const config = resolve(contracts, 'tsconfig.json');
  const source = readdirSync(resolve(contracts, 'src'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => resolve(contracts, 'src', name));
  const inputs = fingerprint([
    fileURLToPath(import.meta.url),
    manifestPath,
    config,
    require.resolve('typescript/package.json'),
    ...source,
  ]);
  const outputs = Object.values(manifest.exports)
    .filter((entry) => typeof entry === 'object')
    .flatMap((entry) => [resolve(contracts, entry.import), resolve(contracts, entry.types)]);
  const cache = resolve(contracts, 'node_modules/.cache/progress-contracts');
  const stampPath = resolve(cache, 'build.json');
  const previous = readStamp(stampPath);
  if (previous?.inputs === inputs && previous.outputs === fingerprint(outputs)) return false;
  console.log('Building workspace progress contracts.');
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', config], {
    cwd: contracts,
    stdio: 'inherit',
    windowsHide: true,
  });
  mkdirSync(cache, { recursive: true });
  writeFileSync(stampPath, JSON.stringify({ inputs, outputs: fingerprint(outputs) }) + '\n');
  return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareWorkspaceContracts();
