#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import { rmSync, existsSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const args = parseArgs({
  options: {
    cache: { type: 'string' },
    scripts: { type: 'string' },
    workspace: { type: 'string' },
    runs: { type: 'string', default: '5' },
    output: { type: 'string', default: 'results.json' },
    'npm-config-dir': { type: 'string' },
    'pnpm-config-dir': { type: 'string' },
  },
});

const { cache, scripts, workspace, runs, output, 'npm-config-dir': npmConfigDir, 'pnpm-config-dir': pnpmConfigDir } = args.values;

const VALID_CACHES = ['cold', 'warm'];
const VALID_SCRIPTS = ['enabled', 'disabled'];
const VALID_WORKSPACES = ['root', 'worker'];

const errors = [];
if (!VALID_CACHES.includes(cache)) errors.push(`--cache must be one of: ${VALID_CACHES.join(', ')}`);
if (!VALID_SCRIPTS.includes(scripts)) errors.push(`--scripts must be one of: ${VALID_SCRIPTS.join(', ')}`);
if (!VALID_WORKSPACES.includes(workspace)) errors.push(`--workspace must be one of: ${VALID_WORKSPACES.join(', ')}`);
if (!npmConfigDir) errors.push('--npm-config-dir is required');
if (!pnpmConfigDir) errors.push('--pnpm-config-dir is required');
const numRuns = Number.parseInt(runs, 10);
if (!Number.isInteger(numRuns) || numRuns < 1) errors.push(`--runs must be a positive integer (got "${runs}")`);
if (errors.length > 0) {
  console.error('Error: invalid benchmark arguments:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const scriptsEnabled = scripts === 'enabled';
const isCold = cache === 'cold';
const isWorker = workspace === 'worker';
const cwd = process.cwd();
const workerDir = join(cwd, 'workers', 'api-gateway');

function cleanNodeModules() {
  rmSync(join(cwd, 'node_modules'), { recursive: true, force: true });
  rmSync(join(workerDir, 'node_modules'), { recursive: true, force: true });
}

function swapConfig(manager) {
  const configDir = manager === 'npm' ? npmConfigDir : pnpmConfigDir;

  if (manager === 'npm') {
    copyFileSync(join(configDir, 'package.json'), join(cwd, 'package.json'));
    copyFileSync(join(configDir, 'package-lock.json'), join(cwd, 'package-lock.json'));
    mkdirSync(workerDir, { recursive: true });
    copyFileSync(join(configDir, 'workers/api-gateway/package.json'), join(workerDir, 'package.json'));
    copyFileSync(join(configDir, 'workers/api-gateway/package-lock.json'), join(workerDir, 'package-lock.json'));
    rmSync(join(cwd, 'pnpm-lock.yaml'), { force: true });
    rmSync(join(cwd, 'pnpm-workspace.yaml'), { force: true });
  } else {
    copyFileSync(join(configDir, 'package.json'), join(cwd, 'package.json'));
    copyFileSync(join(configDir, 'pnpm-lock.yaml'), join(cwd, 'pnpm-lock.yaml'));
    copyFileSync(join(configDir, 'pnpm-workspace.yaml'), join(cwd, 'pnpm-workspace.yaml'));
    mkdirSync(workerDir, { recursive: true });
    copyFileSync(join(configDir, 'workers/api-gateway/package.json'), join(workerDir, 'package.json'));
    rmSync(join(cwd, 'package-lock.json'), { force: true });
    rmSync(join(workerDir, 'package-lock.json'), { force: true });
  }
}

function duBytes(dir) {
  if (!existsSync(dir)) return null;
  try {
    const out = execSync(`du -sb "${dir}" 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
    return out ? parseInt(out, 10) : null;
  } catch {
    return null;
  }
}

function measureInstall(manager, opts = {}) {
  const { storeDir, cacheDir, prime = false } = opts;

  let cmd, cmdArgs, installCwd;
  if (manager === 'pnpm') {
    if (isWorker) {
      cmd = 'pnpm';
      cmdArgs = ['--filter', 'api-gateway', 'install', '--frozen-lockfile'];
      installCwd = cwd;
    } else {
      cmd = 'pnpm';
      cmdArgs = ['install', '--frozen-lockfile'];
      installCwd = cwd;
    }
    if (!scriptsEnabled) cmdArgs.push('--ignore-scripts');
    if (storeDir) cmdArgs.push('--store-dir', storeDir);
  } else {
    if (isWorker) {
      cmd = 'npm';
      cmdArgs = ['ci'];
      installCwd = workerDir;
    } else {
      cmd = 'npm';
      cmdArgs = ['ci'];
      installCwd = cwd;
    }
    if (!scriptsEnabled) cmdArgs.push('--ignore-scripts');
  }

  const env = { ...process.env };
  if (manager === 'npm' && cacheDir) {
    env.npm_config_cache = cacheDir;
  }

  const start = performance.now();
  const result = spawnSync(cmd, cmdArgs, {
    cwd: installCwd,
    stdio: 'pipe',
    env,
    timeout: 300000,
  });
  const elapsed = performance.now() - start;
  const success = result.status === 0;

  if (prime) {
    return { success, elapsedMs: Math.round(elapsed) };
  }

  const targetDir = isWorker ? join(workerDir, 'node_modules') : join(cwd, 'node_modules');
  const nodeModulesBytes = duBytes(targetDir);
  const pnpmStoreBytes = manager === 'pnpm' && storeDir ? duBytes(storeDir) : null;
  const npmCacheBytes = manager === 'npm' && cacheDir ? duBytes(cacheDir) : null;

  return {
    elapsedMs: Math.round(elapsed),
    nodeModulesBytes,
    pnpmStoreBytes,
    npmCacheBytes,
    diskMeasured: nodeModulesBytes != null,
    success,
    stdout: result.stdout?.toString().substring(0, 500),
    stderr: result.stderr?.toString().substring(0, 500),
  };
}

const scriptsLabel = scriptsEnabled ? 'scripts' : 'no-scripts';
const scenarioName = `${workspace}-${cache}-${scriptsLabel}`;

console.log(`\n=== Paired Scenario: ${scenarioName} (${numRuns} trials, alternating order) ===\n`);

const results = [];

const npmCacheBase = join(cwd, '.benchmark-npm-cache');
const pnpmStoreBase = join(cwd, '.benchmark-pnpm-store');

if (isCold) {
  for (let i = 0; i < numRuns; i++) {
    const order = i % 2 === 0 ? ['npm', 'pnpm'] : ['pnpm', 'npm'];
    console.log(`Trial ${i + 1}/${numRuns} (order: ${order.join(' -> ')})`);

    for (const manager of order) {
      const npmCacheDir = join(cwd, `.benchmark-npm-cache-${Date.now()}-${manager}`);
      const pnpmStoreDir = join(cwd, `.benchmark-pnpm-store-${Date.now()}-${manager}`);
      rmSync(npmCacheDir, { recursive: true, force: true });
      rmSync(pnpmStoreDir, { recursive: true, force: true });

      cleanNodeModules();
      swapConfig(manager);

      const result = measureInstall(manager, {
        cacheDir: npmCacheDir,
        storeDir: pnpmStoreDir,
      });

      results.push({
        run: i + 1,
        scenario: `${manager}-${scenarioName}`,
        manager,
        workspace,
        cache,
        scripts: scriptsEnabled ? 'enabled' : 'disabled',
        trialOrder: order.indexOf(manager) === 0 ? 'first' : 'second',
        ...result,
      });

      rmSync(npmCacheDir, { recursive: true, force: true });
      rmSync(pnpmStoreDir, { recursive: true, force: true });

      console.log(`  ${manager}: ${result.elapsedMs}ms, success: ${result.success}`);
    }
  }
} else {
  rmSync(npmCacheBase, { recursive: true, force: true });
  rmSync(pnpmStoreBase, { recursive: true, force: true });

  console.log('Priming isolated caches (untimed)...');

  cleanNodeModules();
  swapConfig('npm');
  const npmPrime = measureInstall('npm', { cacheDir: npmCacheBase, prime: true });
  console.log(`  npm prime: ${npmPrime.elapsedMs}ms, success: ${npmPrime.success}`);

  cleanNodeModules();
  swapConfig('pnpm');
  const pnpmPrime = measureInstall('pnpm', { storeDir: pnpmStoreBase, prime: true });
  console.log(`  pnpm prime: ${pnpmPrime.elapsedMs}ms, success: ${pnpmPrime.success}`);

  if (!npmPrime.success || !pnpmPrime.success) {
    console.error('Priming failed — aborting');
    rmSync(npmCacheBase, { recursive: true, force: true });
    rmSync(pnpmStoreBase, { recursive: true, force: true });
    process.exit(1);
  }

  for (let i = 0; i < numRuns; i++) {
    const order = i % 2 === 0 ? ['npm', 'pnpm'] : ['pnpm', 'npm'];
    console.log(`Trial ${i + 1}/${numRuns} (order: ${order.join(' -> ')})`);

    for (const manager of order) {
      cleanNodeModules();
      swapConfig(manager);

      const result = measureInstall(manager, {
        cacheDir: npmCacheBase,
        storeDir: pnpmStoreBase,
      });

      results.push({
        run: i + 1,
        scenario: `${manager}-${scenarioName}`,
        manager,
        workspace,
        cache,
        scripts: scriptsEnabled ? 'enabled' : 'disabled',
        trialOrder: order.indexOf(manager) === 0 ? 'first' : 'second',
        ...result,
      });

      console.log(`  ${manager}: ${result.elapsedMs}ms, success: ${result.success}`);
    }
  }

  rmSync(npmCacheBase, { recursive: true, force: true });
  rmSync(pnpmStoreBase, { recursive: true, force: true });
}

const outputFile = join(cwd, output);
writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${outputFile}`);
