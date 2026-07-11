#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

let md = '# Package Manager Benchmark Results\n\n';
md += `**Date:** ${new Date().toISOString()}\n`;
md += `**Total trials:** ${allResults.length}\n\n`;

md += '## Install Time by Scenario\n\n';
md += '| Scenario | Manager | Workspace | Cache | Scripts | Median (ms) | Min (ms) | Max (ms) | Disk (MB) | Success |\n';
md += '|---|---|---|---|---|---|---|---|---|---|\n';

const sortedScenarios = Object.keys(scenarios).sort();
for (const scenario of sortedScenarios) {
  const results = scenarios[scenario];
  const successes = results.map((r) => r.success);
  const allSuccess = successes.every((s) => s);
  const validResults = results.filter((r) => r.success);
  const validTimes = validResults.map((r) => r.elapsedMs);
  const validDisks = validResults.filter((r) => r.diskMeasured && r.diskUsageBytes != null).map((r) => r.diskUsageBytes);

  md += `| ${scenario} | ${results[0].manager} | ${results[0].workspace} | ${results[0].cache} | ${results[0].scripts} | `;
  if (validTimes.length > 0) {
    md += `${median(validTimes)} | ${min(validTimes)} | ${max(validTimes)} | `;
  } else {
    md += 'N/A | N/A | N/A | ';
  }
  if (validDisks.length > 0) {
    md += `${Math.round(median(validDisks) / 1024 / 1024)} | `;
  } else {
    md += 'N/A | ';
  }
  md += `${allSuccess ? 'ALL PASS' : 'SOME FAIL'} |\n`;
}

md += '\n## npm vs pnpm Comparison\n\n';
md += '| Scenario | npm Median (ms) | pnpm Median (ms) | Improvement | npm Disk (MB) | pnpm Disk (MB) | Disk Saving |\n';
md += '|---|---|---|---|---|---|---|\n';

const npmScenarios = sortedScenarios.filter((s) => s.startsWith('npm-'));
for (const npmSc of npmScenarios) {
  const pnpmSc = npmSc.replace('npm-', 'pnpm-');
  if (!scenarios[pnpmSc]) continue;

  const npmValid = scenarios[npmSc].filter((r) => r.success);
  const pnpmValid = scenarios[pnpmSc].filter((r) => r.success);
  const npmTimes = npmValid.map((r) => r.elapsedMs);
  const pnpmTimes = pnpmValid.map((r) => r.elapsedMs);
  const npmDisks = npmValid.filter((r) => r.diskMeasured && r.diskUsageBytes != null).map((r) => r.diskUsageBytes);
  const pnpmDisks = pnpmValid.filter((r) => r.diskMeasured && r.diskUsageBytes != null).map((r) => r.diskUsageBytes);

  const label = npmSc.replace('npm-', '');

  if (npmTimes.length === 0 || pnpmTimes.length === 0) {
    md += `| ${label} | N/A | N/A | N/A | N/A | N/A | N/A |\n`;
    continue;
  }

  const npmMed = median(npmTimes);
  const pnpmMed = median(pnpmTimes);
  const improvement = npmMed > 0 ? Math.round(((npmMed - pnpmMed) / npmMed) * 100) : 0;
  const npmDiskMb = npmDisks.length > 0 ? Math.round(median(npmDisks) / 1024 / 1024) : 'N/A';
  const pnpmDiskMb = pnpmDisks.length > 0 ? Math.round(median(pnpmDisks) / 1024 / 1024) : 'N/A';
  const diskSaving = typeof npmDiskMb === 'number' && typeof pnpmDiskMb === 'number' ? `${npmDiskMb - pnpmDiskMb} MB` : 'N/A';

  md += `| ${label} | ${npmMed} | ${pnpmMed} | ${improvement}% | ${npmDiskMb} | ${pnpmDiskMb} | ${diskSaving} |\n`;
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
    md += `| Warm install improvement | >20% proceed, <15% stay, 15-20% decide | ${improvement}% |\n`;
  } else {
    md += `| Warm install improvement | >20% proceed, <15% stay, 15-20% decide | N/A (failed trials) |\n`;
  }
}

md += '\n## Raw Results\n\n';
md += '```json\n';
md += JSON.stringify(allResults, null, 2);
md += '\n```\n';

writeFileSync(outputFile, md);
console.log(`Summary written to ${outputFile}`);
