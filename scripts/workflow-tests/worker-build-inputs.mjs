// Keeps the runbook's api-gateway build-input list equal to the Worker's real source closure.
// Workers Builds only rebuilds for watched paths, so an undocumented input outside
// workers/api-gateway/ can change the bundle without any Worker build (issue #1079).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
const ROOT = resolve('.');
const WORKER = 'workers/api-gateway';
const RUNBOOK = 'docs/runbook.md';
// Any bundled npm package makes the root lockfile a build input.
const LOCKFILE = 'pnpm-lock.yaml';
const RUNTIME_PREFIXES = ['node:', 'cloudflare:'];
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function workerEntry() {
  const main = readFileSync(join(WORKER, 'wrangler.toml'), 'utf8').match(/^main\s*=\s*"([^"]+)"/m);
  assert.ok(main, `${WORKER}/wrangler.toml must declare main`);
  return join(WORKER, main[1]);
}
/** tsconfig `paths` as [specifier prefix, absolute target prefix], longest prefix first. */
function workerAliases() {
  const { paths } = JSON.parse(readFileSync(join(WORKER, 'tsconfig.json'), 'utf8')).compilerOptions;
  return Object.entries(paths)
    .map(([key, [target]]) => [key.replace(/\*$/, ''), resolve(WORKER, target.replace(/\*$/, ''))])
    .sort(([a], [b]) => b.length - a.length);
}
const isImportCall = (node) =>
  node.expression.kind === ts.SyntaxKind.ImportKeyword ||
  (ts.isIdentifier(node.expression) && node.expression.text === 'require');
/** Module specifier of an import/export/import()/require() node; fails on computed specifiers. */
function specifierOf(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (!ts.isCallExpression(node) || !isImportCall(node)) return undefined;
  const [argument] = node.arguments;
  assert.ok(ts.isStringLiteralLike(argument), `computed import: ${node.getText()}`);
  return argument;
}
/** Every module specifier in a file, read from the TypeScript AST so comments and strings are inert. */
function specifiersIn(file, code = readFileSync(file, 'utf8')) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    const specifier = specifierOf(node);
    if (specifier) found.push(specifier.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
function specifierBase(fromFile, specifier, aliases) {
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
  const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
  if (alias) return join(alias[1], specifier.slice(alias[0].length));
  return RUNTIME_PREFIXES.some((p) => specifier.startsWith(p)) ? null : join(ROOT, LOCKFILE);
}
function resolveImport(fromFile, specifier, aliases) {
  const base = specifierBase(fromFile, specifier, aliases);
  if (!base) return null;
  const candidates = [base, `${base}.ts`, base.replace(/\.js$/, '.ts'), join(base, 'index.ts')];
  const found = candidates.find(isFile);
  assert.ok(found, `cannot resolve ${specifier} from ${relative(ROOT, fromFile)}`);
  return found;
}
/** Repo-relative files reachable from the wrangler entry; tests are excluded by construction. */
function workerSourceClosure() {
  const aliases = workerAliases();
  const seen = new Set();
  const pending = [resolve(workerEntry())];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.ts')) {
      pending.push(
        ...specifiersIn(file)
          .map((s) => resolveImport(file, s, aliases))
          .filter(Boolean)
      );
    }
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
test('the closure follows imports outside workers/api-gateway', () => {
  const outside = workerSourceClosure().filter((file) => !file.startsWith(`${WORKER}/`));
  assert.ok(
    outside.some((file) => file.startsWith('shared/')),
    'Worker imports shared/ today'
  );
});
test('every import form is found, prose is ignored and computed imports fail', () => {
  const file = join(ROOT, WORKER, 'src', '__fixture__.ts');
  const parse = (code) => specifiersIn(file, code);
  const code = [
    "export { a } from'./a';",
    'import(`./b`);',
    "require('./c');",
    "import type { D } from './d';",
    "const route = '/api/*'; /* import('./hidden') */ const msg = \"from 'x'\";",
    "import './e'; // import('./comment')",
  ].join('\n');
  assert.deepEqual(parse(code), ['./a', './b', './c', './d', './e']);
  assert.throws(() => parse('import(`./locales/${lang}.ts`);'), /computed import/);
  assert.throws(() => parse("require('./' + name);"), /computed import/);
  // Unknown aliases and npm packages both surface as the (unlisted) lockfile input.
  assert.equal(specifierBase(file, '@app/x', workerAliases()), join(ROOT, LOCKFILE));
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
