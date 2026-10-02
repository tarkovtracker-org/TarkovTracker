#!/usr/bin/env node
// Discovery brief for a file, exported symbol, or branch diff. See scripts/ci/README.md.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildBrief,
  isCodePath,
  parseAutoImportMap,
  parseComponentMap,
  renderBrief,
} from './change-brief-lib.mjs';
import { collectChanges } from './validation-plan.mjs';
import { gitExecutable } from './validation-tools.mjs';
const maxDiffTargets = 12;
const concurrency = 4;
const fallow = fileURLToPath(import.meta.resolve('fallow/bin/fallow'));
const git = (args) =>
  execFileSync(gitExecutable(), args, {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
// `git grep` exits 1 when nothing matches; that is an empty result, not a failure.
const grep = (args, specs) => {
  try {
    return git(['grep', '--untracked', ...args, '--', ...specs])
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
};
const readOptional = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
function inspect(target) {
  const selector = target.symbol
    ? ['--symbol', `${target.file}:${target.symbol}`]
    : ['--file', target.file];
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [fallow, 'inspect', ...selector, '--format', 'json', '--quiet'],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ error: true, message: error.message }));
    child.on('close', () => resolve(parseReport(output)));
  });
}
function parseReport(output) {
  try {
    return JSON.parse(output);
  } catch {
    return { error: true, message: 'Fallow returned no JSON' };
  }
}
async function mapLimited(items, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
function generated() {
  const components = readOptional('.nuxt/components.d.ts');
  const autoImports = readOptional('.nuxt/imports.d.ts');
  return {
    present: Boolean(components && autoImports),
    components: components ? parseComponentMap(components) : null,
    autoImports: autoImports ? parseAutoImportMap(autoImports) : null,
  };
}
const io = {
  inspect,
  map: mapLimited,
  generated,
  grepFiles: (args, specs) => grep(['-l', ...args], specs),
  grepLines: grep,
  fileExists: existsSync,
  listFiles: () => git(['ls-files', '-z']).split('\0').filter(Boolean),
  instructionFiles: () => git(['ls-files', '-z', '--', '*AGENTS.md']).split('\0').filter(Boolean),
};
function normalizeFile(file) {
  const normalized = relative(process.cwd(), resolve(file.replaceAll('\\', '/'))).replaceAll(
    '\\',
    '/'
  );
  if (!normalized || /^(?:\.\.(?:\/|$)|\/|[a-z]:\/)/i.test(normalized)) {
    throw new Error('--file and --symbol file paths must resolve inside the repository');
  }
  return normalized;
}
function parseSymbol(value) {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) throw new Error(`--symbol must be FILE:EXPORT, received ${value}`);
  return { file: normalizeFile(value.slice(0, separator)), symbol: value.slice(separator + 1) };
}
const noDiff = { changedPaths: [], targets: [], notes: [] };
function diffTargets(base) {
  if (!base) return noDiff;
  const changes = collectChanges({ base, local: true });
  if (changes.error) throw new Error(changes.error);
  const code = changes.paths.filter((path) => isCodePath(path) && existsSync(path));
  const notes =
    code.length > maxDiffTargets
      ? [
          `Diff has ${code.length} code files; inspected the first ${maxDiffTargets}. Pass --file for the rest.`,
        ]
      : [];
  const targets = code.slice(0, maxDiffTargets).map((file) => ({ file }));
  return { changedPaths: changes.paths, targets, notes };
}
const cliOptions = {
  file: { type: 'string', multiple: true, default: [] },
  symbol: { type: 'string', multiple: true, default: [] },
  base: { type: 'string' },
  format: { type: 'string', default: 'text' },
};
function readRequest() {
  const { values } = parseArgs({ options: cliOptions });
  if (!['text', 'json'].includes(values.format)) throw new Error('--format must be text or json');
  const diff = diffTargets(values.base);
  const explicit = [
    ...values.file.map((file) => ({ file: normalizeFile(file) })),
    ...values.symbol.map(parseSymbol),
  ];
  const targets = [...explicit, ...diff.targets];
  if (!targets.length && !diff.changedPaths.length) {
    throw new Error('Pass --file <path>, --symbol <file:export>, or --base <ref>');
  }
  const request = { targets, changedPaths: diff.changedPaths, base: values.base };
  return { format: values.format, notes: diff.notes, request };
}
async function main() {
  const { format, notes, request } = readRequest();
  const brief = await buildBrief(io, request);
  brief.uncertainty.push(...notes);
  console.log(format === 'json' ? JSON.stringify(brief, null, 2) : renderBrief(brief));
}
main().catch((error) => {
  console.error(`[change-brief] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
