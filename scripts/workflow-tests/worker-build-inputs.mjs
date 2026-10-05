// Keeps the runbook's api-gateway build-input list equal to the Worker's real source closure.
// Workers Builds only rebuilds for watched paths, so an undocumented input outside
// workers/api-gateway/ can change the bundle without any Worker build (issue #1079).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
const ROOT = resolve('.');
const WORKER = 'workers/api-gateway';
const RUNBOOK = 'docs/runbook.md';
const RUNTIME_PREFIXES = ['node:', 'cloudflare:'];
// `from '…'`, `import '…'`, `import(…)` and `require(…)` with any static string quote.
const SPECIFIER_RE = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`$\s]+)\1/g;
// Block comments and whole-line `//` comments, so prose such as "import `name`" is not scanned.
const COMMENT_RE = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm;
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function workerEntry() {
  const main = readFileSync(join(WORKER, 'wrangler.toml'), 'utf8').match(/^main\s*=\s*"([^"]+)"/m);
  assert.ok(main, `${WORKER}/wrangler.toml must declare main`);
  return join(WORKER, main[1]);
}
/** tsconfig `paths` as [specifier prefix, absolute target prefix]; wrangler applies them to all files. */
function workerAliases() {
  const { paths } = JSON.parse(readFileSync(join(WORKER, 'tsconfig.json'), 'utf8')).compilerOptions;
  return Object.entries(paths).map(([key, [target]]) => [
    key.replace(/\*$/, ''),
    resolve(WORKER, target.replace(/\*$/, '')),
  ]);
}
function isInstalledPackage(specifier) {
  const name = specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
  return [WORKER, '.'].some((dir) => existsSync(join(dir, 'node_modules', name)));
}
function specifierBase(fromFile, specifier, aliases) {
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
  const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
  if (alias) return join(alias[1], specifier.slice(alias[0].length));
  const external = RUNTIME_PREFIXES.some((p) => specifier.startsWith(p));
  assert.ok(external || isInstalledPackage(specifier), `unknown import specifier ${specifier}`);
  return null;
}
function resolveImport(fromFile, specifier, aliases) {
  const base = specifierBase(fromFile, specifier, aliases);
  if (!base) return null;
  const candidates = [base, `${base}.ts`, base.replace(/\.js$/, '.ts'), join(base, 'index.ts')];
  const found = candidates.find(isFile);
  assert.ok(found, `cannot resolve ${specifier} from ${relative(ROOT, fromFile)}`);
  return found;
}
function importsOf(file, aliases) {
  const specifiers = [
    ...readFileSync(file, 'utf8').replace(COMMENT_RE, '').matchAll(SPECIFIER_RE),
  ].map((m) => m[2]);
  return specifiers.map((s) => resolveImport(file, s, aliases)).filter(Boolean);
}
/** Repo-relative source files reachable from the wrangler entry; tests are excluded by construction. */
function workerSourceClosure() {
  const aliases = workerAliases();
  const seen = new Set();
  const pending = [resolve(workerEntry())];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...importsOf(file, aliases));
  }
  return [...seen].map((file) => relative(ROOT, file)).sort();
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
  assert.ok(files.includes(workerEntry()));
  assert.deepEqual(inputDrift(patterns, files), { undocumented: [], stale: [] });
});
test('the closure reaches the Worker code outside workers/api-gateway', () => {
  const outside = workerSourceClosure().filter((file) => !file.startsWith(`${WORKER}/`));
  assert.ok(outside.includes('app/utils/modeProgress.ts'));
  assert.ok(outside.includes('shared/utils/requirementStatus.ts'), 'transitive shared import');
});
test('every import form is scanned and unknown aliases fail', () => {
  const source = "export { a } from './a';\nimport(`./b`);\nrequire('./c');\nimport './d';";
  assert.deepEqual(
    [...source.matchAll(SPECIFIER_RE)].map((m) => m[2]),
    ['./a', './b', './c', './d']
  );
  assert.throws(() => specifierBase(workerEntry(), '@app/utils/constants', workerAliases()));
});
test('a runbook without the build-input list is rejected', () => {
  assert.throws(() => documentedInputs('Confirm `Workers Builds: api-gateway` succeeded.'));
});
test('a new unlisted input and a stale entry are both reported', () => {
  const drift = inputDrift(
    [`${WORKER}/**`, 'app/utils/removed.ts'],
    [`${WORKER}/src/index.ts`, 'app/utils/modeProgress.ts']
  );
  assert.deepEqual(drift, {
    undocumented: ['app/utils/modeProgress.ts'],
    stale: ['app/utils/removed.ts'],
  });
});
