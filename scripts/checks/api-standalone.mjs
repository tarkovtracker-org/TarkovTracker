import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { checkProgressContracts } from './progress-contracts.mjs';
const root = process.cwd();
const version = checkProgressContracts(root);
const destination = mkdtempSync(join(tmpdir(), 'tarkov-api-standalone-'));
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run through pnpm run verify:api-standalone.');
const run = (cwd, args) =>
  execFileSync(process.execPath, [pnpmCli, ...args], { cwd, stdio: 'inherit' });
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const secretFile = (path) =>
  basename(path).startsWith('.dev.vars') ||
  (basename(path).startsWith('.env') && basename(path) !== '.env.example');
// Carry the reviewed supply-chain policy, without frontend package entries or its Nuxt patch.
const policy = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  .replace(/^packages:[\s\S]*?(?=catalog:)/, 'packages:\n  - .\n')
  .replace(/^patchedDependencies:[\s\S]*$/m, '');
console.log(`Standalone evidence directory: ${destination}`);
const gateway = join(destination, 'gateway');
cpSync(join(root, 'workers/api-gateway'), gateway, {
  recursive: true,
  filter: (path) =>
    !/(?:^|[/\\])(?:node_modules|\.wrangler|progress-contracts)(?:[/\\]|$)/.test(path) &&
    !secretFile(path),
});
const declaration = join(gateway, 'worker-configuration.d.ts');
writeFileSync(declaration, readFileSync(declaration, 'utf8').replaceAll('\r\n', '\n'));
writeFileSync(join(gateway, 'pnpm-workspace.yaml'), policy);
run(gateway, ['install', '--lockfile-only']);
const standaloneLock = readFileSync(join(gateway, 'pnpm-lock.yaml'), 'utf8');
if (!standaloneLock.includes(version.contracts.integrity))
  throw new Error('Standalone gateway resolved a different contracts archive.');
run(gateway, ['install', '--frozen-lockfile']);
for (const command of ['typecheck', 'types:check', 'validate:openapi', 'test', 'build'])
  run(gateway, ['run', command, ...(command === 'test' ? ['--silent'] : [])]);
const packages = JSON.parse(
  execFileSync(process.execPath, [pnpmCli, 'list', '--depth', 'Infinity', '--json'], {
    cwd: gateway,
    encoding: 'utf8',
  })
);
if (/"(?:nuxt|vue|pinia|h3|@nuxt\/[^" ]+)"\s*:/.test(JSON.stringify(packages)))
  throw new Error('Standalone gateway installed frontend dependencies.');
const missingOwners = [
  'app',
  '.nuxt',
  'shared',
  'supabase',
  'tests/fixtures',
  'progress-contracts',
];
if (missingOwners.some((path) => existsSync(join(gateway, path))))
  throw new Error('Standalone gateway contains an external source owner.');
const report = {
  ...version,
  lockSha256: createHash('sha256').update(standaloneLock).digest('hex'),
  gateway,
  packages,
};
writeJson(join(destination, 'evidence.json'), report);
console.log(
  `Standalone legacy gateway passed with released progress contracts. Evidence: ${resolve(destination, 'evidence.json')}`
);
