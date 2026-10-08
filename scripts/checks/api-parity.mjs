import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProgressContracts, compareCompiledContracts } from './progress-contracts.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const version = checkProgressContracts(root);
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run through pnpm run verify:api-parity.');
if (!/^[a-f0-9]{40}$/.test(version.commit))
  throw new Error('API source must use a complete commit.');
if (!version.sourceRef?.startsWith('refs/tags/'))
  throw new Error('API source must use a versioned tag.');
if (version.repository !== 'https://github.com/tarkovtracker-org/TarkovTracker-API.git')
  throw new Error('Unexpected API source repository.');
const destination = mkdtempSync(join(tmpdir(), 'tarkov-versioned-api-'));
const run = (cwd, args, env = process.env) =>
  execFileSync(process.execPath, [pnpmCli, ...args], {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
const git = (args) =>
  execFileSync('git', args, { cwd: destination, encoding: 'utf8', windowsHide: true });
git(['init', '--quiet']);
git(['check-ref-format', version.sourceRef]);
git(['fetch', '--quiet', '--depth=1', '--no-tags', version.repository, version.sourceRef]);
git(['-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
if (git(['rev-parse', 'HEAD']).trim() !== version.commit)
  throw new Error('API source commit differs.');
console.log(`Versioned API ${version.commit}; standalone evidence directory: ${destination}`);
run(destination, ['install', '--frozen-lockfile']);
run(destination, ['--filter', '@tarkovtracker/progress-contracts', 'run', 'build']);
const contractsEntry = fileURLToPath(
  import.meta.resolve('@tarkovtracker/progress-contracts/apiTaskUpdates')
);
const installed = resolve(dirname(contractsEntry), '..');
for (const packageRoot of [installed, join(destination, 'progress-contracts')]) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.version !== version.contracts.version)
    throw new Error('API source and frontend contracts version differ.');
}
const files = compareCompiledContracts(installed, join(destination, 'progress-contracts'));
run(destination, ['--filter', '@tarkovtracker/progress-contracts', 'run', 'test', '--silent']);
for (const command of ['typecheck', 'types:check', 'validate:openapi', 'test', 'build'])
  run(destination, ['run', command, ...(command === 'test' ? ['--silent'] : [])]);
run(root, ['exec', 'vitest', 'run', 'workers/contract-tests/taskFailureParity.test.ts'], {
  ...process.env,
  TARKOV_VERSIONED_API_DIRECTORY: destination,
});
writeFileSync(
  join(destination, 'consumer-evidence.json'),
  JSON.stringify({ ...version, comparedContracts: files, frontendParity: 'passed' }, null, 2) + '\n'
);
console.log(
  `Versioned API checks and all-mode frontend parity passed: ${join(destination, 'consumer-evidence.json')}`
);
