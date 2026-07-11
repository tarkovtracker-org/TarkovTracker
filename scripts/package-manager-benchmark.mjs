#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import { rmSync, existsSync, writeFileSync } from 'node:fs';
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

const VALID_MANAGERS = ['npm', 'pnpm'];
const VALID_CACHES = ['cold', 'warm'];
const VALID_SCRIPTS = ['enabled', 'disabled'];
const VALID_WORKSPACES = ['root', 'worker'];

const errors = [];
if (!VALID_MANAGERS.includes(manager)) errors.push(`--manager must be one of: ${VALID_MANAGERS.join(', ')}`);
if (!VALID_CACHES.includes(cache)) errors.push(`--cache must be one of: ${VALID_CACHES.join(', ')}`);
if (!VALID_SCRIPTS.includes(scripts)) errors.push(`--scripts must be one of: ${VALID_SCRIPTS.join(', ')}`);
if (!VALID_WORKSPACES.includes(workspace)) errors.push(`--workspace must be one of: ${VALID_WORKSPACES.join(', ')}`);
const numRuns = Number.parseInt(runs, 10);
if (!Number.isInteger(numRuns) || numRuns < 1) errors.push(`--runs must be a positive integer (got "${runs}")`);
if (errors.length > 0) {
  console.error('Error: invalid benchmark arguments:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const scriptsEnabled = scripts === 'enabled';
const isCold = cache === 'cold';
const isWorker = workspace === 'worker';
const isPnpm = manager === 'pnpm';

const workerDir = join(process.cwd(), 'workers', 'api-gateway');

function cleanNodeModules() {
  rmSync(join(process.cwd(), 'node_modules'), { recursive: true, force: true });
  rmSync(join(workerDir, 'node_modules'), { recursive: true, force: true });
}

let activeCacheDir = null;

function cleanCache() {
  if (isPnpm) {
    activeCacheDir = join(process.cwd(), `.pnpm-store-${Date.now()}`);
    rmSync(activeCacheDir, { recursive: true, force: true });
  } else {
    activeCacheDir = join(process.cwd(), `.npm-cache-${Date.now()}`);
    rmSync(activeCacheDir, { recursive: true, force: true });
    process.env.npm_config_cache = activeCacheDir;
  }
}

function cleanActiveCache() {
  if (activeCacheDir) {
    rmSync(activeCacheDir, { recursive: true, force: true });
    activeCacheDir = null;
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
    if (isCold && activeCacheDir) args.push('--store-dir', activeCacheDir);
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

  let diskUsage = null;
  let diskMeasured = false;
  const targetDir = isWorker ? join(workerDir, 'node_modules') : join(process.cwd(), 'node_modules');
  if (existsSync(targetDir)) {
    try {
      const output = execSync(`du -sb "${targetDir}" 2>/dev/null | cut -f1`, { encoding: 'utf8' }).trim();
      if (output) {
        diskUsage = parseInt(output, 10);
        diskMeasured = true;
      }
    } catch {
      // du failed — leave diskUsage as null so summary can exclude it
    }
  }

  return {
    elapsedMs: Math.round(elapsed),
    diskUsageBytes: diskUsage,
    diskMeasured,
    success,
    stdout: result.stdout?.toString().substring(0, 500),
    stderr: result.stderr?.toString().substring(0, 500),
  };
}

const results = [];
const scriptsLabel = scriptsEnabled ? 'scripts' : 'no-scripts';
const scenarioName = `${manager}-${workspace}-${cache}-${scriptsLabel}`;

console.log(`\n=== Scenario: ${scenarioName} (${numRuns} runs) ===\n`);

for (let i = 0; i < numRuns; i++) {
  console.log(`Run ${i + 1}/${numRuns}...`);

  cleanNodeModules();
  if (isCold) cleanCache();

  let result;
  try {
    result = measureInstall();
  } finally {
    if (isCold) cleanActiveCache();
  }
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
    `  elapsed: ${result.elapsedMs}ms, disk: ${result.diskUsageBytes ?? 'N/A'} bytes, success: ${result.success}`,
  );
}

const outputFile = join(process.cwd(), output);
writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${outputFile}`);
