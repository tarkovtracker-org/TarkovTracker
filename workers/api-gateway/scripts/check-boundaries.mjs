import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const isWithin = (root, path) => {
  const location = relative(root, path);
  return location === '' || (!location.startsWith('..') && !location.includes(':'));
};
function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}
export function inspectImports(source, file, root, allowed) {
  const violations = [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const check = (specifier) => {
    if (specifier.startsWith('.')) {
      if (!isWithin(root, resolve(dirname(file), specifier))) violations.push(specifier);
      return;
    }
    if (!allowed(specifier)) violations.push(specifier);
  };
  const isLoaderCall = (node) =>
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require');
  const isLoading = (node) => ts.isCallExpression(node) && isLoaderCall(node);
  const isStaticSpecifier = (node) =>
    ts.isStringLiteralLike(node) && node.parent.moduleSpecifier === node;
  const checkLiteral = (operand) => {
    if (operand && ts.isStringLiteralLike(operand)) check(operand.text);
    else violations.push('nonliteral dynamic import');
  };
  const visit = (node) => {
    if (isStaticSpecifier(node)) check(node.text);
    if (ts.isExternalModuleReference(node)) checkLiteral(node.expression);
    if (isLoading(node)) checkLiteral(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return violations;
}
const isTestSource = (file) => file.includes('__tests__') || file.endsWith('.test.ts');
function inspectTree(root, allowed, includeTests = true) {
  return sourceFiles(root)
    .filter((file) => /\.[jt]s$/.test(file) && (includeTests || !isTestSource(file)))
    .flatMap((file) => {
      const permitted = (specifier) => allowed(specifier, file);
      const boundary = file.includes('__tests__') ? resolve(root, '..') : root;
      return inspectImports(readFileSync(file, 'utf8'), file, boundary, permitted).map(
        (specifier) => `${file}: forbidden import ${specifier}`
      );
    });
}
const contractsImport = (specifier) => specifier.startsWith('@tarkovtracker/progress-contracts/');
const localAlias = (specifier, root) =>
  /^[@~]\//.test(specifier) && isWithin(root, resolve(root, specifier.slice(2)));
const gatewayImport = (specifier, file, root) =>
  [
    localAlias(specifier, root),
    specifier === 'cloudflare:workers' || contractsImport(specifier),
    file.includes('__tests__') && /^(node:|vitest$|wrangler$)/.test(specifier),
  ].some(Boolean);
export function checkBoundaries(
  gatewayRoot,
  contractsEntry = fileURLToPath(
    import.meta.resolve('@tarkovtracker/progress-contracts/apiTaskUpdates')
  )
) {
  const contractsRoot = dirname(contractsEntry);
  const gatewaySource = resolve(gatewayRoot, 'src');
  const config = JSON.parse(readFileSync(resolve(gatewayRoot, 'tsconfig.json'), 'utf8'));
  const violations = Object.values(config.compilerOptions.paths)
    .flat()
    .filter((path) => !isWithin(gatewaySource, resolve(gatewayRoot, path)));
  return [
    ...violations.map((path) => `tsconfig.json: escaping alias ${path}`),
    ...inspectTree(gatewaySource, (specifier, file) =>
      gatewayImport(specifier, file, gatewaySource)
    ),
    ...inspectTree(contractsRoot, () => false, false),
  ];
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkBoundaries(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (violations.length) throw new Error(violations.join('\n'));
  console.log('Gateway and progress contracts import boundaries passed.');
}
