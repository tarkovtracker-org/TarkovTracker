import { getFallbackRanges } from './javascript-fallback.mjs';
const getNodeComments = (source, node, typescript) => [
  ...(typescript.getLeadingCommentRanges(source, node.pos) ?? []),
  ...(typescript.getTrailingCommentRanges(source, node.end) ?? []),
];
const protectComments = (comments, ranges, typescript) => {
  for (const comment of comments) {
    if (comment.kind === typescript.SyntaxKind.MultiLineCommentTrivia) {
      ranges.set(comment.pos, { end: comment.end, start: comment.pos });
    }
  }
};
const startsInsideLiteral = (comment, literals) =>
  literals.some((literal) => literal.start <= comment.start && comment.start < literal.end);
const getScriptKind = (extension, typescript) => {
  if (extension === '.tsx') return typescript.ScriptKind.TSX;
  if (extension === '.ts') return typescript.ScriptKind.TS;
  return typescript.ScriptKind.JS;
};
export const getJavaScriptRanges = (source, filePath, extension, typescript) => {
  if (!typescript) return getFallbackRanges(source, extension);
  const ranges = [];
  const comments = new Map();
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
    protectComments(getNodeComments(source, node, typescript), comments, typescript);
    if (protectedKinds.has(node.kind)) {
      ranges.push({ end: node.getEnd(), start: node.getStart(sourceFile) });
    }
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);
  const realComments = [...comments.values()].filter(
    (comment) => !startsInsideLiteral(comment, ranges)
  );
  return [...ranges, ...realComments];
};
