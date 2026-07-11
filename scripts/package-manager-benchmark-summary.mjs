#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const args = parseArgs({
  options: {
    'input-dir': { type: 'string' },
    output: { type: 'string', default: 'benchmark-summary.md' },
  },
});

const inputDir = args.values['input-dir'];
const outputFile = args.values.output;

if (!inputDir) {
  console.error('Error: --input-dir is required');
  process.exit(1);
}
if (!existsSync(inputDir)) {
  console.error(`Error: --input-dir "${inputDir}" does not exist`);
  process.exit(1);
}

const stat = statSync(inputDir);
if (!stat.isDirectory()) {
  console.error(`Error: --input-dir "${inputDir}" is not a directory`);
  process.exit(1);
}

const files = readdirSync(inputDir).filter((f) => f.endsWith('.json'));

const allResults = [];
for (const file of files) {
  const data = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  allResults.push(...data);
}

const scenarios = {};
for (const r of allResults) {
  if (!scenarios[r.scenario]) scenarios[r.scenario] = [];
  scenarios[r.scenario].push(r);
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function min(arr) {
  return Math.min(...arr);
}

function max(arr) {
  return Math.max(...arr);
}

function mb(bytes) {
  if (bytes == null) return 'N/A';
  return Math.round(bytes / 1024 / 1024);
}

let md = '# Package Manager Benchmark Results\n\n';
md += `**Date:** ${new Date().toISOString()}\n`;
md += `**Total trials:** ${allResults.length}\n`;
md += '**Methodology:** Paired trials on the same runner, alternating order (npm→pnpm, pnpm→npm).\n';
md += 'Warm caches use isolated, pre-primed cache directories. Cold caches are freshly created per trial.\n\n';

md += '## Install Time by Scenario\n\n';
md += '| Scenario | Manager | Workspace | Cache | Scripts | Order | Median (ms) | Min (ms) | Max (ms) | node_modules (MB) | Store/Cache (MB) | Success |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|---|\n';

const sortedScenarios = Object.keys(scenarios).sort();
for (const scenario of sortedScenarios) {
  const results = scenarios[scenario];
  const allSuccess = results.every((r) => r.success);
  const validResults = results.filter((r) => r.success);
  const validTimes = validResults.map((r) => r.elapsedMs);
  const validNodeModules = validResults.filter((r) => r.nodeModulesBytes != null).map((r) => r.nodeModulesBytes);
  const validAuxDisk = validResults
    .filter((r) => r.pnpmStoreBytes != null || r.npmCacheBytes != null)
    .map((r) => r.pnpmStoreBytes ?? r.npmCacheBytes);

  for (const r of validResults.length > 0 ? validResults : results) {
    md += `| ${scenario} | ${r.manager} | ${r.workspace} | ${r.cache} | ${r.scripts} | ${r.trialOrder ?? 'N/A'} | `;
    break;
  }
  if (validTimes.length > 0) {
    md += `${median(validTimes)} | ${min(validTimes)} | ${max(validTimes)} | `;
  } else {
    md += 'N/A | N/A | N/A | ';
  }
  md += `${validNodeModules.length > 0 ? mb(median(validNodeModules)) : 'N/A'} | `;
  md += `${validAuxDisk.length > 0 ? mb(median(validAuxDisk)) : 'N/A'} | `;
  md += `${allSuccess ? 'ALL PASS' : 'SOME FAIL'} |\n`;
}

md += '\n## npm vs pnpm Comparison (Paired)\n\n';
md += '| Scenario | npm Median (ms) | pnpm Median (ms) | Improvement | npm node_modules (MB) | pnpm node_modules (MB) | node_modules Saving |\n';
md += '|---|---|---|---|---|---|---|\n';

const npmScenarios = sortedScenarios.filter((s) => s.startsWith('npm-'));
for (const npmSc of npmScenarios) {
  const pnpmSc = npmSc.replace('npm-', 'pnpm-');
  if (!scenarios[pnpmSc]) continue;

  const npmValid = scenarios[npmSc].filter((r) => r.success);
  const pnpmValid = scenarios[pnpmSc].filter((r) => r.success);
  const npmTimes = npmValid.map((r) => r.elapsedMs);
  const pnpmTimes = pnpmValid.map((r) => r.elapsedMs);
  const npmDisks = npmValid.filter((r) => r.nodeModulesBytes != null).map((r) => r.nodeModulesBytes);
  const pnpmDisks = pnpmValid.filter((r) => r.nodeModulesBytes != null).map((r) => r.nodeModulesBytes);

  const label = npmSc.replace('npm-', '');

  if (npmTimes.length === 0 || pnpmTimes.length === 0) {
    md += `| ${label} | N/A | N/A | N/A | N/A | N/A | N/A |\n`;
    continue;
  }

  const npmMed = median(npmTimes);
  const pnpmMed = median(pnpmTimes);
  const improvement = npmMed > 0 ? Math.round(((npmMed - pnpmMed) / npmMed) * 100) : 0;
  const npmDiskMb = npmDisks.length > 0 ? mb(median(npmDisks)) : 'N/A';
  const pnpmDiskMb = pnpmDisks.length > 0 ? mb(median(pnpmDisks)) : 'N/A';
  const diskSaving =
    typeof npmDiskMb === 'number' && typeof pnpmDiskMb === 'number' ? `${npmDiskMb - pnpmDiskMb} MB` : 'N/A';

  md += `| ${label} | ${npmMed} | ${pnpmMed} | ${improvement}% | ${npmDiskMb} | ${pnpmDiskMb} | ${diskSaving} |\n`;
}

md += '\n## CI Job Pattern Comparison\n\n';
md += 'Most CI jobs install only the root project. The Workers job installs root + worker sequentially.\n';
md += 'Under pnpm workspace, a single `pnpm install` covers both root and worker.\n\n';
md += '| CI Pattern | npm Median (ms) | pnpm Median (ms) | Improvement |\n';
md += '|---|---|---|---|\n';

function getMedianTime(scenario) {
  const results = scenarios[scenario]?.filter((r) => r.success);
  if (!results || results.length === 0) return null;
  return median(results.map((r) => r.elapsedMs));
}

const patterns = [
  {
    name: 'Typical root job (root-warm-scripts)',
    npm: getMedianTime('npm-root-warm-scripts'),
    pnpm: getMedianTime('pnpm-root-warm-scripts'),
  },
  {
    name: 'Workers job (root+worker warm-scripts)',
    npm: (getMedianTime('npm-root-warm-scripts') ?? 0) + (getMedianTime('npm-worker-warm-scripts') ?? 0),
    pnpm: getMedianTime('pnpm-root-warm-scripts'),
  },
  {
    name: 'Typical root job (root-warm-no-scripts)',
    npm: getMedianTime('npm-root-warm-no-scripts'),
    pnpm: getMedianTime('pnpm-root-warm-no-scripts'),
  },
  {
    name: 'Workers job (root+worker warm-no-scripts)',
    npm: (getMedianTime('npm-root-warm-no-scripts') ?? 0) + (getMedianTime('npm-worker-warm-no-scripts') ?? 0),
    pnpm: getMedianTime('pnpm-root-warm-no-scripts'),
  },
];

for (const p of patterns) {
  if (p.npm && p.pnpm && p.npm > 0) {
    const imp = Math.round(((p.npm - p.pnpm) / p.npm) * 100);
    md += `| ${p.name} | ${p.npm} | ${p.pnpm} | ${imp}% |\n`;
  } else {
    md += `| ${p.name} | ${p.npm ?? 'N/A'} | ${p.pnpm ?? 'N/A'} | N/A |\n`;
  }
}

md += '\n## Decision Criteria\n\n';
md += '| Criterion | Threshold | Result |\n';
md += '|---|---|---|\n';

const npmWarmScripts = scenarios['npm-root-warm-scripts'];
const pnpmWarmScripts = scenarios['pnpm-root-warm-scripts'];
if (npmWarmScripts && pnpmWarmScripts) {
  const npmValid = npmWarmScripts.filter((r) => r.success).map((r) => r.elapsedMs);
  const pnpmValid = pnpmWarmScripts.filter((r) => r.success).map((r) => r.elapsedMs);
  if (npmValid.length > 0 && pnpmValid.length > 0) {
    const npmMed = median(npmValid);
    const pnpmMed = median(pnpmValid);
    const improvement = Math.round(((npmMed - pnpmMed) / npmMed) * 100);
    md += `| Warm root install improvement | >20% proceed, <15% stay, 15-20% decide | ${improvement}% |\n`;
  } else {
    md += `| Warm root install improvement | >20% proceed, <15% stay, 15-20% decide | N/A (failed trials) |\n`;
  }
} else {
  md += `| Warm root install improvement | >20% proceed, <15% stay, 15-20% decide | N/A (missing scenario) |\n`;
}

md += '\n## Disk Usage Notes\n\n';
md += 'Disk measurements are **node_modules apparent size** (`du -sb`) only.\n';
md += 'They do not include the pnpm store, npm cache, or GitHub cache archive size.\n';
md += 'For developer disk footprint, add the incremental package-manager cache/store growth.\n';
md += 'For CI, installation duration is more important than post-install directory size.\n\n';

md += '## Raw Results\n\n';
md += '```json\n';
md += JSON.stringify(allResults, null, 2);
md += '\n```\n';

writeFileSync(outputFile, md);
console.log(`Summary written to ${outputFile}`);
