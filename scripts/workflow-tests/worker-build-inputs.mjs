// Keeps the runbook's api-gateway build-input list equal to the Worker's real source closure.
// Workers Builds only rebuilds for watched paths, so an undocumented input outside
// workers/api-gateway/ can change the bundle without any Worker build (issue #1079).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
const ROOT = resolve('.');
const WORKER = 'workers/api-gateway';
const ENTRY = `${WORKER}/src/index.ts`;
const RUNBOOK = 'docs/runbook.md';
// Path aliases from workers/api-gateway/tsconfig.json; wrangler resolves them for every file.
const ALIASES = [
  ['@shared/', 'shared/'],
  ['@/', `${WORKER}/src/`],
  ['~/', `${WORKER}/src/`],
];
const SPECIFIER_RE = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function aliasTarget(specifier) {
  const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
  return alias ? join(ROOT, alias[1], specifier.slice(alias[0].length)) : null;
}
function resolveSpecifier(fromFile, specifier) {
  const base = specifier.startsWith('.')
    ? resolve(dirname(fromFile), specifier)
    : aliasTarget(specifier);
  if (!base) return null; // bare package import
  const found = [base, `${base}.ts`, join(base, 'index.ts')].find(isFile);
  assert.ok(found, `cannot resolve ${specifier} from ${relative(ROOT, fromFile)}`);
  return found;
}
/** Repo-relative source files reachable from the Worker entry, tests excluded by construction. */
function workerSourceClosure(root = ROOT, entry = ENTRY) {
  const seen = new Set();
  const pending = [join(root, entry)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER_RE)) {
      const target = resolveSpecifier(file, match[1] ?? match[2]);
      if (target) pending.push(target);
    }
  }
  return [...seen].map((file) => relative(root, file)).sort();
}
/** Backticked path patterns listed between the runbook's build-input markers. */
function documentedInputs(markdown) {
  const block = markdown.match(
    /<!-- api-gateway-build-inputs:start -->([\s\S]*?)<!-- api-gateway-build-inputs:end -->/
  );
  assert.ok(block, `${RUNBOOK} must list the api-gateway build inputs between its markers`);
  return [...block[1].matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
}
const covers = (pattern, file) =>
  pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern;
function inputDrift(patterns, files) {
  return {
    undocumented: files.filter((file) => !patterns.some((pattern) => covers(pattern, file))),
    stale: patterns.filter((pattern) => !files.some((file) => covers(pattern, file))),
  };
}
test('runbook lists every api-gateway build input and nothing stale', () => {
  const patterns = documentedInputs(readFileSync(RUNBOOK, 'utf8'));
  const files = workerSourceClosure();
  assert.ok(files.includes(ENTRY));
  assert.deepEqual(inputDrift(patterns, files), { undocumented: [], stale: [] });
});
test('the closure reaches the Worker code outside workers/api-gateway', () => {
  const outside = workerSourceClosure().filter((file) => !file.startsWith(`${WORKER}/`));
  assert.ok(outside.includes('app/utils/modeProgress.ts'));
  assert.ok(outside.includes('shared/utils/requirementStatus.ts'), 'transitive shared import');
});
test('a runbook without the build-input list is rejected', () => {
  assert.throws(() => documentedInputs('Confirm `Workers Builds: api-gateway` succeeded.'));
});
test('a new unlisted input and a stale entry are both reported', () => {
  const drift = inputDrift(
    [`${WORKER}/**`, 'app/utils/removed.ts'],
    [ENTRY, 'app/utils/modeProgress.ts']
  );
  assert.deepEqual(drift, {
    undocumented: ['app/utils/modeProgress.ts'],
    stale: ['app/utils/removed.ts'],
  });
});
