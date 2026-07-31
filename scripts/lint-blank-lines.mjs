#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import ts from 'typescript';
const FIX = process.argv.includes('--fix');
const requestedFiles = process.argv.slice(2).filter((argument) => argument !== '--fix');
const root = process.cwd();
const supportedExtensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const excludedFiles = new Set([
  '.coderabbit.yaml',
  'pnpm-lock.yaml',
  'supabase/functions/_shared/database.types.ts',
]);
const excludedDirectories = ['.git/', '.nuxt/', 'coverage/', 'dist/', 'node_modules/'];
const safeYamlFiles = new Set([
  '.github/dependabot.yml',
  '.github/labeler.yml',
  'codecov.yml',
  'pnpm-workspace.yaml',
  'socket.yml',
]);
const normalizePath = (filePath) => filePath.replaceAll('\\', '/');
const isCandidate = (filePath) => {
  const normalizedPath = normalizePath(filePath);
  const extension = extname(normalizedPath).toLowerCase();
  return (
    !excludedFiles.has(normalizedPath) &&
    !excludedDirectories.some((directory) => normalizedPath.includes(directory)) &&
    supportedExtensions.has(extension) &&
    ((extension !== '.yaml' && extension !== '.yml') ||
      safeYamlFiles.has(normalizedPath) ||
      normalizedPath.startsWith('.github/workflows/'))
  );
};
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const files = (requestedFiles.length ? requestedFiles : trackedFiles())
  .map((filePath) => relative(root, resolve(root, filePath)))
  .filter(isCandidate);
const getProtectedRanges = (source, filePath) => {
  const ranges = [...source.matchAll(/\/\*[\s\S]*?\*\//g)].map((match) => ({
    end: match.index + match[0].length,
    start: match.index,
  }));
  const extension = extname(filePath).toLowerCase();
  if (!['.cjs', '.js', '.mjs', '.ts', '.tsx'].includes(extension)) return ranges;
  const scriptKind =
    extension === '.tsx'
      ? ts.ScriptKind.TSX
      : extension === '.ts'
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const visit = (node) => {
    if (
      node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      node.kind === ts.SyntaxKind.TemplateExpression ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      ranges.push({ end: node.getEnd(), start: node.getFullStart() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
};
const stripBlankLines = (source, filePath) => {
  const lines = source.split('\n');
  const hasFinalNewline = source.endsWith('\n');
  const lastLine = hasFinalNewline ? lines.length - 1 : lines.length;
  const protectedRanges = getProtectedRanges(source, filePath);
  const isCodeFile = ['.cjs', '.js', '.mjs', '.ts', '.tsx'].includes(
    extname(filePath).toLowerCase()
  );
  const output = [];
  let blockComment = false;
  let quote = null;
  let heredoc = null;
  let removed = 0;
  let offset = 0;
  for (let index = 0; index < lastLine; index += 1) {
    const line = lines[index];
    const isBlank = /^[\t \r]*$/.test(line);
    const isProtected = protectedRanges.some(
      ({ end, start }) => start <= offset && offset + line.length <= end
    );
    if (heredoc) {
      output.push(line);
      offset += line.length + 1;
      if (line.trim() === heredoc) heredoc = null;
      continue;
    }
    if (isBlank && !blockComment && !quote && !isProtected) {
      removed += 1;
      offset += line.length + 1;
      continue;
    }
    output.push(line);
    if (isCodeFile) {
      offset += line.length + 1;
      continue;
    }
    for (let position = 0; position < line.length; position += 1) {
      const character = line[position];
      const nextCharacter = line[position + 1];
      if (quote) {
        if (character === '\\') {
          position += 1;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (blockComment) {
        if (character === '*' && nextCharacter === '/') {
          blockComment = false;
          position += 1;
        }
        continue;
      }
      if (character === '/' && nextCharacter === '*') {
        blockComment = true;
        position += 1;
      } else if (character === '/' && nextCharacter === '/') {
        break;
      } else if (character === '`' || character === '"' || character === "'") {
        quote = character;
      }
    }
    if (!blockComment && !quote) {
      const heredocMatch = line.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
      if (heredocMatch) heredoc = heredocMatch[1];
    }
    offset += line.length + 1;
  }
  return {
    removed,
    source: output.join('\n') + (hasFinalNewline ? '\n' : ''),
  };
};
let changedFiles = 0;
let removedLines = 0;
for (const filePath of files) {
  const absolutePath = resolve(root, filePath);
  const original = readFileSync(absolutePath, 'utf8');
  const result = stripBlankLines(original, filePath);
  if (result.removed === 0) continue;
  changedFiles += 1;
  removedLines += result.removed;
  if (FIX) writeFileSync(absolutePath, result.source);
  console.log(`${FIX ? 'fixed' : 'blank lines'} ${filePath}: ${result.removed}`);
}
if (!FIX && changedFiles > 0) {
  console.error(`Found ${removedLines} removable blank line(s) in ${changedFiles} file(s).`);
  process.exitCode = 1;
}
