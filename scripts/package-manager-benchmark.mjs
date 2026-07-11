#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import { rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const args = parseArgs({
  options: {
    manager: { type: 'string' },
    cache: { type: 'string' },
    scripts: { type: 'string' },
    workspace: { type: 'string' },
    runs: { type: 'string', default: '5' },
    output: { type: 'string', default: 'results.json' },
  },
});

const { manager, cache, scripts, workspace, runs, output } = args.values;

const numRuns = parseInt(runs, 10);
const scriptsEnabled = scripts === 'enabled';
const isCold = cache === 'cold';
const isWorker = workspace === 'worker';
const isPnpm = manager === 'pnpm';

const workerDir = join(process.cwd(), 'workers', 'api-gateway');

function cleanNodeModules() {
  rmSync(join(process.cwd(), 'node_modules'), { recursive: true, force: true });
  rmSync(join(workerDir, 'node_modules'), { recursive: true, force: true });
}

let pnpmStoreDir = null;

function cleanCache() {
  if (isPnpm) {
    pnpmStoreDir = join(process.cwd(), `.pnpm-store-${Date.now()}`);
    rmSync(pnpmStoreDir, { recursive: true, force: true });
  } else {
    const npmCache = join(process.cwd(), `.npm-cache-${Date.now()}`);
    rmSync(npmCache, { recursive: true, force: true });
    process.env.npm_config_cache = npmCache;
  }
}

function measureInstall() {
  const start = performance.now();

  let cmd, args, cwd;
  if (isPnpm) {
    if (isWorker) {
      cmd = 'pnpm';
      args = ['--filter', 'api-gateway', 'install', '--frozen-lockfile'];
      cwd = process.cwd();
    } else {
      cmd = 'pnpm';
      args = ['install', '--frozen-lockfile'];
      cwd = process.cwd();
    }
    if (!scriptsEnabled) args.push('--ignore-scripts');
    if (isCold && pnpmStoreDir) args.push('--store-dir', pnpmStoreDir);
  } else {
    if (isWorker) {
      cmd = 'npm';
      args = ['ci'];
      cwd = workerDir;
    } else {
      cmd = 'npm';
      args = ['ci'];
      cwd = process.cwd();
    }
    if (!scriptsEnabled) args.push('--ignore-scripts');
  }

  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env },
    timeout: 300000,
  });

  const elapsed = performance.now() - start;
  const success = result.status === 0;

  let diskUsage = 0;
  const targetDir = isWorker ? join(workerDir, 'node_modules') : join(process.cwd(), 'node_modules');
  if (existsSync(targetDir)) {
    try {
      diskUsage = parseInt(
        execSync(`du -sb ${targetDir} 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim() || '0',
        10,
      );
    } catch {
      diskUsage = 0;
    }
  }

  return {
    elapsedMs: Math.round(elapsed),
    diskUsageBytes: diskUsage,
    success,
    stdout: result.stdout?.toString().substring(0, 500),
    stderr: result.stderr?.toString().substring(0, 500),
  };
}

const results = [];
const scenarioName = `${manager}-${workspace}-${cache}-${scripts}`;

console.log(`\n=== Scenario: ${scenarioName} (${numRuns} runs) ===\n`);

for (let i = 0; i < numRuns; i++) {
  console.log(`Run ${i + 1}/${numRuns}...`);

  cleanNodeModules();
  if (isCold) cleanCache();

  const result = measureInstall();
  results.push({
    run: i + 1,
    scenario: scenarioName,
    manager,
    workspace,
    cache,
    scripts: scriptsEnabled ? 'enabled' : 'disabled',
    ...result,
  });

  console.log(
    `  elapsed: ${result.elapsedMs}ms, disk: ${result.diskUsageBytes} bytes, success: ${result.success}`,
  );
}

const outputFile = join(process.cwd(), output);
writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${outputFile}`);
