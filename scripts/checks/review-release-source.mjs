// Offline review tool. Run with the already-vetted project compiler; never installs or executes
// the release under review. Its output becomes a protected, code-reviewed artifact receipt.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireEvidence, sha256 } from './dependency-evidence.mjs';
const require = createRequire(import.meta.url);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const blob = (bytes) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function typescriptParity(published, source, format) {
  const ts = require('typescript');
  requireEvidence(
    ts.version === '6.0.3',
    'Review compiler must be the vetted TypeScript 6.0.3 pin'
  );
  const printer = ts.createPrinter({ removeComments: true });
  const normalize = (text) =>
    printer.printFile(
      ts.createSourceFile('file.js', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
    );
  const compiled = ts.transpileModule(source.toString(), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: format === 'esm' ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  return normalize(compiled) === normalize(published.toString());
}
function compareFile(packageRoot, sourceRoot, path) {
  const published = readFileSync(path);
  const file = relative(packageRoot, path);
  const compiled = /^dist\/(esm|commonjs)\/([^/]+)\.js$/.exec(file);
  const source = compiled ? `src/${compiled[2]}.ts` : file;
  requireEvidence(
    [compiled, file.startsWith('lib/')].some(Boolean),
    `Unsupported runtime layout: ${file}`
  );
  const upstream = readFileSync(join(sourceRoot, source));
  const matches = compiled
    ? typescriptParity(published, upstream, compiled[1])
    : published.equals(upstream);
  requireEvidence(matches, `Source comparison failed: ${file}`);
  return {
    file,
    publishedSha256: sha256(published),
    source,
    sourceSha256: sha256(upstream),
    sourceBlob: blob(upstream),
    method: compiled ? 'typescript-6.0.3-ast-parity' : 'identical',
  };
}
export function compareRuntime(packageRoot, sourceRoot) {
  const runtime = files(packageRoot).filter((path) => /\.[cm]?js$/.test(path));
  const convenience = runtime.filter((path) => /\/dist\/.*\.min\.js$/.test(path));
  const compared = runtime.filter((path) => !convenience.includes(path));
  requireEvidence(compared.length > 0, 'No runtime modules found');
  const comparison = compared.map((path) => compareFile(packageRoot, sourceRoot, path));
  return {
    comparison,
    comparisonSha256: sha256(JSON.stringify(comparison)),
    notCompared: convenience.map((path) => relative(packageRoot, path)),
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  requireEvidence(
    process.argv.length === 4,
    'Usage: node scripts/checks/review-release-source.mjs <published-directory> <upstream-directory>'
  );
  console.log(JSON.stringify(compareRuntime(process.argv[2], process.argv[3]), null, 2));
}
