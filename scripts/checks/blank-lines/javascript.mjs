import { getFallbackRanges } from './javascript-fallback.mjs';
const getCommentRanges = (source, extension, typescript) => {
  const scanner = typescript.createScanner(
    typescript.ScriptTarget.Latest,
    false,
    extension === '.tsx' ? typescript.LanguageVariant.JSX : typescript.LanguageVariant.Standard,
    source
  );
  const ranges = [];
  let token;
  while ((token = scanner.scan()) !== typescript.SyntaxKind.EndOfFileToken) {
    if (token === typescript.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ end: scanner.getTextPos(), start: scanner.getTokenPos() });
    }
  }
  return ranges;
};
const getScriptKind = (extension, typescript) => {
  if (extension === '.tsx') return typescript.ScriptKind.TSX;
  if (extension === '.ts') return typescript.ScriptKind.TS;
  return typescript.ScriptKind.JS;
};
export const getJavaScriptRanges = (source, filePath, extension, typescript) => {
  if (!typescript) return getFallbackRanges(source, extension);
  const ranges = getCommentRanges(source, extension, typescript);
  const sourceFile = typescript.createSourceFile(
    filePath,
    source,
    typescript.ScriptTarget.Latest,
    true,
    getScriptKind(extension, typescript)
  );
  const protectedKinds = new Set([
    typescript.SyntaxKind.NoSubstitutionTemplateLiteral,
    typescript.SyntaxKind.TemplateHead,
    typescript.SyntaxKind.TemplateMiddle,
    typescript.SyntaxKind.TemplateTail,
    typescript.SyntaxKind.JsxText,
  ]);
  const visit = (node) => {
    if (protectedKinds.has(node.kind)) {
      ranges.push({ end: node.getEnd(), start: node.getStart(sourceFile) });
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
};
