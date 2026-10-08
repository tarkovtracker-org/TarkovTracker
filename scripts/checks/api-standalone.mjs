import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
const root = process.cwd();
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
const contracts = join(destination, 'contracts');
cpSync(join(root, 'workers/api-gateway/progress-contracts'), contracts, {
  recursive: true,
  filter: (path) => !/(?:^|[/\\])(?:node_modules|dist)(?:[/\\]|$)/.test(path),
});
writeFileSync(join(contracts, 'pnpm-workspace.yaml'), policy);
run(contracts, ['install', '--lockfile-only']);
run(contracts, ['install', '--frozen-lockfile']);
run(contracts, ['run', 'build']);
run(contracts, ['run', 'test']);
run(contracts, ['pack', '--pack-destination', destination]);
const archive = readdirSync(destination).find((file) => file.endsWith('.tgz'));
if (!archive) throw new Error('Progress contracts pack produced no archive.');
const digest = () =>
  createHash('sha512')
    .update(readFileSync(join(destination, archive)))
    .digest('hex');
const firstDigest = digest();
run(contracts, ['pack', '--pack-destination', destination]);
if (digest() !== firstDigest) throw new Error('Progress contracts pack is not reproducible.');
const gateway = join(destination, 'gateway');
cpSync(join(root, 'workers/api-gateway'), gateway, {
  recursive: true,
  filter: (path) =>
    !/(?:^|[/\\])(?:node_modules|\.wrangler|progress-contracts)(?:[/\\]|$)/.test(path) &&
    !secretFile(path),
});
const declaration = join(gateway, 'worker-configuration.d.ts');
writeFileSync(declaration, readFileSync(declaration, 'utf8').replaceAll('\r\n', '\n'));
const manifest = JSON.parse(readFileSync(join(gateway, 'package.json'), 'utf8'));
manifest.dependencies['@tarkovtracker/progress-contracts'] = `file:../${archive}`;
writeJson(join(gateway, 'package.json'), manifest);
writeFileSync(join(gateway, 'pnpm-workspace.yaml'), policy);
run(gateway, ['install', '--lockfile-only']);
run(gateway, ['install', '--frozen-lockfile']);
for (const command of ['typecheck', 'types:check', 'validate:openapi', 'test', 'build'])
  run(gateway, ['run', command]);
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
const report = { archive, sha512: firstDigest, gateway, packages };
writeJson(join(destination, 'evidence.json'), report);
console.log(
  `Standalone gateway passed with packed progress contracts. Evidence: ${resolve(destination, 'evidence.json')}`
);
