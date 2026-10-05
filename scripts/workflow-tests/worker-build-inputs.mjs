// Keeps the runbook's api-gateway build-input list equal to the files the Worker build reads.
// Workers Builds only rebuilds for watched paths, so an undocumented input outside
// workers/api-gateway/ can change the bundle without any Worker build (issue #1079).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
const ROOT = realpathSync('.');
const WORKER = 'workers/api-gateway';
const RUNBOOK = 'docs/runbook.md';
// The Worker is a pnpm workspace member, so every install of it (Workers Builds runs
// `npx wrangler deploy` in WORKER) resolves Wrangler, esbuild and all packages through the
// workspace root's files, independent of what the Worker imports.
const LOCKFILE = 'pnpm-lock.yaml';
const WORKSPACE_FILES = [
  'pnpm-workspace.yaml',
  LOCKFILE,
  'package.json',
  '.npmrc',
  '.pnpmfile.cjs',
  '.pnpmfile.mjs',
];
// esbuild applies the nearest package.json (module type, sideEffects) and tsconfig (paths, JSX and
// import options) above each bundled file, so files outside WORKER use the repository root's.
const PACKAGE_CONFIGS = ['package.json'];
const TS_CONFIGS = ['tsconfig.json', 'jsconfig.json'];
// Without --config, wrangler prefers these anywhere up the tree over WORKER/wrangler.toml.
const SHADOWING_WRANGLER_CONFIGS = ['wrangler.json', 'wrangler.jsonc'];
const RUNTIME_PREFIXES = ['node:', 'cloudflare:'];
// Files esbuild parses for further imports. EXTENSIONS is esbuild's default `resolveExtensions`
// order, which wrangler does not override, so ambiguous specifiers pick the file it bundles.
const SOURCE_RE = /\.[cm]?[jt]sx?$/;
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function workerEntry() {
  const wrangler = readFileSync(join(WORKER, 'wrangler.toml'), 'utf8');
  // Wrangler `[alias]` can redirect any specifier; this scanner does not model it.
  assert.doesNotMatch(
    wrangler,
    /^\s*(\[(env\.[^\]]+\.)?alias\]|alias\s*[=.])/m,
    'teach this check wrangler [alias] first'
  );
  const main = wrangler.match(/^main\s*=\s*"([^"]+)"/m);
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
/** Literal argument of an import()/require() call; fails on computed specifiers. */
function callSpecifierOf(node) {
  if (!isImportCall(node)) return undefined;
  const [argument] = node.arguments;
  assert.ok(ts.isStringLiteralLike(argument), `computed import: ${node.getText()}`);
  return argument;
}
/** Specifier of `import x = require('…')`. */
function importEqualsSpecifierOf(node) {
  const reference = node.moduleReference;
  return ts.isExternalModuleReference(reference) ? reference.expression : undefined;
}
/** Module specifier of an import/export declaration or an import()/require() call. */
const SPECIFIER_READERS = [
  [ts.isImportDeclaration, (node) => node.moduleSpecifier],
  [ts.isExportDeclaration, (node) => node.moduleSpecifier],
  [ts.isImportEqualsDeclaration, importEqualsSpecifierOf],
  [ts.isCallExpression, callSpecifierOf],
];
function specifierOf(node) {
  const reader = SPECIFIER_READERS.find(([matches]) => matches(node));
  return reader?.[1](node);
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
const isWorkerFile = (file) => relative(join(ROOT, WORKER), file).split(sep)[0] !== '..';
function specifierBase(fromFile, specifier, aliases) {
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
  if (RUNTIME_PREFIXES.some((p) => specifier.startsWith(p))) return null;
  // Outside WORKER, esbuild resolves bare specifiers with the root tsconfig's generated paths.
  assert.ok(
    isWorkerFile(fromFile),
    `teach this check root tsconfig paths first: ${specifier} in ${relative(ROOT, fromFile)}`
  );
  const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
  return alias ? join(alias[1], specifier.slice(alias[0].length)) : join(ROOT, LOCKFILE);
}
function resolveImport(fromFile, specifier, aliases) {
  const base = specifierBase(fromFile, specifier, aliases);
  if (!base) return null;
  const candidates = [
    base,
    ...EXTENSIONS.map((extension) => base + extension),
    ...['.ts', '.tsx'].map((extension) => base.replace(/\.js$/, extension)),
    ...EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  const found = candidates.find(isFile);
  assert.ok(found, `cannot resolve ${specifier} from ${relative(ROOT, fromFile)}`);
  // esbuild records symlinked files under their real path.
  return realpathSync(found);
}
/** Absolute real paths reachable from the wrangler entry; tests are excluded by construction. */
function workerSourceClosure() {
  const aliases = workerAliases();
  const seen = new Set();
  const pending = [realpathSync(workerEntry())];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (SOURCE_RE.test(file)) {
      pending.push(
        ...specifiersIn(file)
          .map((s) => resolveImport(file, s, aliases))
          .filter(Boolean)
      );
    }
  }
  return [...seen];
}
/** The first of `names` found in `file`'s directory or an ancestor, up to the repository root. */
function nearestConfig(file, names) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const found = names.map((name) => join(dir, name)).find(isFile);
    if (found || !dir.startsWith(ROOT + sep)) return found;
  }
}
const isTracked = (file) =>
  spawnSync('git', ['ls-files', '--error-unmatch', '--', file], { stdio: 'ignore' }).status === 0;
const withJson = (path) => (path.endsWith('.json') ? path : `${path}.json`);
/** Relative `extends` targets of a tsconfig; a missing (not yet generated) file has none. */
function relativeBases(file) {
  const bases = [ts.readConfigFile(file, ts.sys.readFile).config?.extends ?? []].flat();
  return bases
    .filter((path) => path.startsWith('.'))
    .map((path) => withJson(resolve(dirname(file), path)));
}
/** A tsconfig and its relative `extends` chain, split into tracked files and generated ones. */
function tsconfigChain(file, found = { tracked: [], generated: [] }) {
  (isTracked(file) ? found.tracked : found.generated).push(relative(ROOT, file));
  for (const base of relativeBases(file)) tsconfigChain(base, found);
  return found;
}
/** Wrangler configs that would replace WORKER/wrangler.toml for `npx wrangler deploy`. */
function shadowingWranglerConfigs(exists = isFile) {
  const found = [];
  for (let dir = WORKER; ; dir = dirname(dir)) {
    found.push(...SHADOWING_WRANGLER_CONFIGS.map((name) => join(dir, name)).filter(exists));
    if (dir === '.') return found;
  }
}
/** Install inputs at the workspace root; the check fails if WORKER leaves the workspace. */
function workspaceInputs() {
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  assert.match(
    workspace,
    /^\s*-\s*['"]?workers\/api-gateway['"]?\s*$/m,
    'teach this check a standalone Worker install'
  );
  return WORKSPACE_FILES.filter(isFile);
}
/** Repo-relative build inputs, plus generated tsconfig bases the runbook must name. */
function workerBuildInputs() {
  assert.deepEqual(shadowingWranglerConfigs(), [], `teach this check a non-TOML ${WORKER} config`);
  const sources = workerSourceClosure();
  const packages = sources.map((file) => nearestConfig(file, PACKAGE_CONFIGS)).filter(Boolean);
  const chains = [...new Set(sources.map((file) => nearestConfig(file, TS_CONFIGS)))]
    .filter(Boolean)
    .map((file) => tsconfigChain(file));
  const files = [
    ...[...sources, ...packages].map((file) => relative(ROOT, file)),
    ...chains.flatMap(({ tracked }) => tracked),
    ...workspaceInputs(),
  ];
  return {
    files: [...new Set(files)].sort(),
    generated: [...new Set(chains.flatMap(({ generated }) => generated))].sort(),
  };
}
/** The runbook text between its build-input markers. */
function inputBlock(markdown) {
  const block = markdown.match(
    /<!-- api-gateway-build-inputs:start -->([\s\S]*?)<!-- api-gateway-build-inputs:end -->/
  );
  assert.ok(block, `${RUNBOOK} must list the api-gateway build inputs between its markers`);
  return block[1];
}
/** Backticked path patterns listed between the runbook's build-input markers. */
const documentedInputs = (markdown) =>
  [...inputBlock(markdown).matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
const covers = (pattern, file) =>
  pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern;
function inputDrift(patterns, files) {
  return {
    undocumented: files.filter((file) => !patterns.some((pattern) => covers(pattern, file))),
    stale: patterns.filter((pattern) => !files.some((file) => covers(pattern, file))),
  };
}
test('runbook lists every api-gateway build input and nothing stale', () => {
  const markdown = readFileSync(RUNBOOK, 'utf8');
  const { files, generated } = workerBuildInputs();
  assert.ok(files.includes(workerEntry()));
  assert.deepEqual(inputDrift(documentedInputs(markdown), files), { undocumented: [], stale: [] });
  for (const base of generated) {
    assert.ok(
      inputBlock(markdown).includes(`\`${base}\``),
      `${RUNBOOK} must name generated ${base}`
    );
  }
});
test('the closure follows imports outside workers/api-gateway', () => {
  const outside = workerBuildInputs().files.filter((file) => !file.startsWith(`${WORKER}/`));
  assert.ok(
    outside.some((file) => file.startsWith('shared/')),
    'Worker imports shared/ today'
  );
});
test('toolchain and esbuild configs are inputs regardless of what the Worker imports', () => {
  const { files } = workerBuildInputs();
  // Workspace installs read the root files; esbuild reads the nearest manifest and tsconfig of
  // every bundled file: the Worker's own, and the root ones for bundled shared/ and app/ files.
  const expected = [
    'package.json',
    'tsconfig.json',
    LOCKFILE,
    'pnpm-workspace.yaml',
    `${WORKER}/package.json`,
    `${WORKER}/tsconfig.json`,
  ];
  for (const input of expected)
    assert.ok(files.includes(input), `${input} feeds every Worker build`);
  const shared = join(ROOT, 'shared', 'utils', '__fixture__.ts');
  assert.equal(nearestConfig(shared, TS_CONFIGS), join(ROOT, 'tsconfig.json'));
  assert.equal(nearestConfig(shared, PACKAGE_CONFIGS), join(ROOT, 'package.json'));
});
test('a generated tsconfig base must be named, not listed as a tracked input', () => {
  const { generated } = tsconfigChain(join(ROOT, 'tsconfig.json'));
  assert.deepEqual(generated, ['.nuxt/tsconfig.json']);
});
test('a wrangler.json(c) up the tree, which would replace wrangler.toml, is reported', () => {
  assert.deepEqual(shadowingWranglerConfigs(), []);
  const added = new Set(['workers/wrangler.json', 'wrangler.jsonc']);
  assert.deepEqual(
    shadowingWranglerConfigs((path) => added.has(path)),
    [...added]
  );
});
test('bare imports outside workers/api-gateway are not resolved with Worker aliases', () => {
  const shared = join(ROOT, 'shared', 'utils', '__fixture__.ts');
  assert.throws(() => specifierBase(shared, '@/utils/x', workerAliases()), /root tsconfig paths/);
  assert.equal(specifierBase(shared, './x', workerAliases()), join(ROOT, 'shared', 'utils', 'x'));
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
    "import f = require('./f');",
  ].join('\n');
  assert.deepEqual(parse(code), ['./a', './b', './c', './d', './e', './f']);
  assert.throws(() => parse('import(`./locales/${lang}.ts`);'), /computed import/);
  assert.throws(() => parse("require('./' + name);"), /computed import/);
  // In Worker files, npm packages and unknown aliases both resolve through the lockfile input.
  assert.equal(
    specifierBase(file, '@not-a-configured-alias/x', workerAliases()),
    join(ROOT, LOCKFILE)
  );
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
