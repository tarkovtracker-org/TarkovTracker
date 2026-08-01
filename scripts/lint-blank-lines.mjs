#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
let typescript;
try {
  typescript = (await import('typescript')).default;
} catch {
  typescript = null;
}
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
const normalizePath = (filePath) => filePath.replaceAll('\\', '/');
const isCandidate = (filePath) => {
  const normalizedPath = normalizePath(filePath);
  const extension = extname(normalizedPath).toLowerCase();
  return (
    !excludedFiles.has(normalizedPath) &&
    !excludedDirectories.some((directory) => normalizedPath.includes(directory)) &&
    supportedExtensions.has(extension)
  );
};
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const trackedSymlinks = new Set(
  execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.startsWith('120000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1))
);
const files = (requestedFiles.length ? requestedFiles : trackedFiles())
  .map((filePath) => relative(root, resolve(root, filePath)))
  .filter(isCandidate);
const getProtectedRanges = (source, filePath) => {
  const ranges = [];
  const extension = extname(filePath).toLowerCase();
  if (extension === '.sh') {
    let start = -1;
    let depth = 0;
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === '\\') index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '#' && (index === 0 || /\s/.test(source[index - 1]))) {
        while (index < source.length && source[index] !== '\n') index += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '$' && source[index + 1] === '(') {
        start = start === -1 ? index : start;
        depth += 1;
        index += 1;
      } else if (character === '(' && (index === 0 || /[\s;|&]/.test(source[index - 1]))) {
        start = start === -1 ? index : start;
        depth += 1;
      } else if (depth > 0 && character === '(') {
        depth += 1;
      } else if (depth > 0 && character === ')') {
        depth -= 1;
        if (depth === 0) {
          ranges.push({ end: index + 1, start });
          start = -1;
        }
      }
    }
    return ranges;
  }
  if (!['.cjs', '.js', '.mjs', '.ts', '.tsx'].includes(extension)) return ranges;
  if (!typescript) {
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      const nextCharacter = source[index + 1];
      if (quote) {
        if (character === '\\') index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '/' && nextCharacter === '/') {
        while (index < source.length && source[index] !== '\n') index += 1;
        continue;
      }
      if (character === '/' && nextCharacter === '*') {
        const end = source.indexOf('*/', index + 2);
        if (end !== -1) {
          ranges.push({ end: end + 2, start: index });
          index = end + 1;
        }
      } else if (character === '`') {
        const start = index;
        index += 1;
        while (index < source.length) {
          if (source[index] === '\\') index += 2;
          else if (source[index] === '`') {
            ranges.push({ end: index + 1, start });
            break;
          } else index += 1;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      }
    }
    return ranges;
  }
  const scanner = typescript.createScanner(
    typescript.ScriptTarget.Latest,
    false,
    extension === '.tsx' ? typescript.LanguageVariant.JSX : typescript.LanguageVariant.Standard,
    source
  );
  let token;
  while ((token = scanner.scan()) !== typescript.SyntaxKind.EndOfFileToken) {
    if (token === typescript.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ end: scanner.getTextPos(), start: scanner.getTokenPos() });
    }
  }
  const scriptKind =
    extension === '.tsx'
      ? typescript.ScriptKind.TSX
      : extension === '.ts'
        ? typescript.ScriptKind.TS
        : typescript.ScriptKind.JS;
  const sourceFile = typescript.createSourceFile(
    filePath,
    source,
    typescript.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const visit = (node) => {
    if (
      node.kind === typescript.SyntaxKind.NoSubstitutionTemplateLiteral ||
      node.kind === typescript.SyntaxKind.TemplateExpression ||
      node.kind === typescript.SyntaxKind.TemplateHead ||
      node.kind === typescript.SyntaxKind.TemplateMiddle ||
      node.kind === typescript.SyntaxKind.TemplateTail
    ) {
      ranges.push({ end: node.getEnd(), start: node.getStart(sourceFile) });
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
};
const getYamlScalarLines = (lines, filePath) => {
  const extension = extname(filePath).toLowerCase();
  if (!['.yaml', '.yml'].includes(extension)) return new Set();
  const protectedLines = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const headerMatch = header.match(/^(\s*)(.*)$/);
    if (!headerMatch) continue;
    const headerContent = headerMatch[2].replace(/\s+#.*$/, '').trim();
    if (!/(^|[\s:])[|>](?:[+-]?\d?[+-]?)?$/.test(headerContent)) continue;
    const headerIndent = headerMatch[1].length;
    let contentIndent = null;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (/^[\t ]*$/.test(candidate)) {
        protectedLines.add(next);
        continue;
      }
      const indent = candidate.match(/^\s*/)[0].length;
      if (indent <= headerIndent) break;
      if (contentIndent !== null && indent < contentIndent) break;
      if (contentIndent === null) {
        contentIndent = indent;
        for (let blank = index + 1; blank < next; blank += 1) {
          protectedLines.add(blank);
        }
      }
      protectedLines.add(next);
    }
  }
  return protectedLines;
};
const getShellHeredocs = (line) => {
  const heredocs = [];
  let quote = null;
  let arithmeticDepth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (arithmeticDepth > 0) {
      if (character === '(') arithmeticDepth += 1;
      else if (character === ')') arithmeticDepth -= 1;
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) break;
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (
      (character === '$' && line[index + 1] === '(' && line[index + 2] === '(') ||
      (character === '(' &&
        line[index + 1] === '(' &&
        (index === 0 || /[\s;]/.test(line[index - 1])))
    ) {
      arithmeticDepth = 2;
      index += 2;
      continue;
    }
    if (character !== '<' || line[index + 1] !== '<') continue;
    index += 2;
    const stripTabs = line[index] === '-';
    if (stripTabs) index += 1;
    while (/\s/.test(line[index] ?? '')) index += 1;
    let delimiter = '';
    const hasAnsiQuote =
      line[index] === '$' && (line[index + 1] === '"' || line[index + 1] === "'");
    if (hasAnsiQuote || line[index] === '"' || line[index] === "'") {
      if (hasAnsiQuote) index += 1;
      const delimiterQuote = line[index++];
      while (index < line.length && line[index] !== delimiterQuote) delimiter += line[index++];
      if (line[index] === delimiterQuote) index += 1;
    } else {
      if (line[index] === '\\') index += 1;
      while (index < line.length && !/[;|&<>]/.test(line[index])) {
        if (/\s/.test(line[index]) && line[index - 1] !== '\\') break;
        if (line[index] === '\\' && index + 1 < line.length) {
          delimiter += line[index + 1];
          index += 2;
        } else {
          delimiter += line[index++];
        }
      }
    }
    if (delimiter) heredocs.push({ delimiter, stripTabs });
  }
  return heredocs;
};
const endsWithContinuation = (line) => {
  let backslashes = 0;
  for (let index = line.length - 1; index >= 0 && line[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};
const stripBlankLines = (source, filePath) => {
  if (/^[\t \r\n]*$/.test(source)) return { removed: 0, source };
  const lines = source.split('\n');
  const hasFinalNewline = source.endsWith('\n');
  const lastLine = hasFinalNewline ? lines.length - 1 : lines.length;
  const protectedRanges = getProtectedRanges(source, filePath);
  const yamlScalarLines = getYamlScalarLines(lines, filePath);
  const isCodeFile = ['.cjs', '.js', '.mjs', '.ts', '.tsx'].includes(
    extname(filePath).toLowerCase()
  );
  const isShellFile = extname(filePath).toLowerCase() === '.sh';
  const isYamlFile = ['.yaml', '.yml'].includes(extname(filePath).toLowerCase());
  const output = [];
  let blockComment = false;
  let quote = null;
  let heredocs = [];
  let removed = 0;
  let offset = 0;
  for (let index = 0; index < lastLine; index += 1) {
    const line = lines[index];
    const isBlank = /^[\t \r]*$/.test(line);
    const followsContinuation = isShellFile && index > 0 && endsWithContinuation(lines[index - 1]);
    const isProtected =
      yamlScalarLines.has(index) ||
      protectedRanges.some(({ end, start }) => start <= offset && offset + line.length <= end);
    if (heredocs.length > 0) {
      output.push(line);
      offset += line.length + 1;
      const heredoc = heredocs[0];
      const terminator = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
      if (terminator.replace(/\r$/, '') === heredoc.delimiter) heredocs.shift();
      continue;
    }
    if (isBlank && !followsContinuation && !blockComment && !quote && !isProtected) {
      removed += 1;
      offset += line.length + 1;
      continue;
    }
    output.push(line);
    if (isCodeFile) {
      offset += line.length + 1;
      continue;
    }
    if (isYamlFile) {
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
      if (
        (character === '#' && (position === 0 || /\s/.test(line[position - 1]))) ||
        (character === '/' && nextCharacter === '/')
      ) {
        break;
      }
      if (character === '/' && nextCharacter === '*') {
        blockComment = true;
        position += 1;
      } else if (character === '`' || character === '"' || character === "'") {
        quote = character;
      }
    }
    if (isShellFile && !blockComment && !quote) heredocs = getShellHeredocs(line);
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
  let original;
  try {
    if (trackedSymlinks.has(normalizePath(filePath))) continue;
    original = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
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
