#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
let typescript;
try {
  typescript = process.env.LINT_BLANK_LINES_FORCE_FALLBACK
    ? null
    : (await import('typescript')).default;
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
  '.vue',
  '.yaml',
  '.yml',
]);
const excludedFiles = new Set([
  '.coderabbit.yaml',
  'pnpm-lock.yaml',
  'supabase/functions/_shared/database.types.ts',
  'workers/api-gateway/worker-configuration.d.ts',
]);
const excludedLocalePattern = /^app\/locales\/(?!en\.json$)[^/]+\.json$/;
const excludedDirectories = ['.git/', '.nuxt/', 'coverage/', 'dist/', 'node_modules/'];
const normalizePath = (filePath) => filePath.replaceAll('\\', '/');
const isExcludedDirectory = (filePath, directory) =>
  filePath.startsWith(directory) || filePath.includes(`/${directory}`);
const isCandidate = (filePath) => {
  const normalizedPath = normalizePath(filePath);
  const extension = extname(normalizedPath).toLowerCase();
  return (
    !excludedFiles.has(normalizedPath) &&
    !excludedLocalePattern.test(normalizedPath) &&
    !excludedDirectories.some((directory) => isExcludedDirectory(normalizedPath, directory)) &&
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
const findTagEnd = (source, start) => {
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
};
const getProtectedRanges = (source, filePath) => {
  const ranges = [];
  const extension = extname(filePath).toLowerCase();
  if (extension === '.vue') {
    const ignoredTagRanges = [];
    for (const tagName of ['script', 'style']) {
      for (const opening of source.matchAll(new RegExp(`<${tagName}\\b`, 'gi'))) {
        const openingEnd = findTagEnd(source, opening.index);
        if (openingEnd === -1) continue;
        const closing = source
          .slice(openingEnd + 1)
          .match(new RegExp(`</${tagName}(?:[\\t\\n\\r ]+[^>]*)?>`, 'i'));
        if (!closing) continue;
        ignoredTagRanges.push({
          end: openingEnd + 1 + closing.index + closing[0].length,
          start: opening.index,
        });
      }
    }
    const isIgnoredTagContent = (index) =>
      ignoredTagRanges.some((range) => range.start <= index && index < range.end);
    const getNestedBlockRanges = (tagName) => {
      const blocks = [];
      const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
      let depth = 0;
      let start = -1;
      for (const match of source.matchAll(tags)) {
        if (isIgnoredTagContent(match.index)) continue;
        if (match[0].startsWith('</')) {
          if (depth === 0) continue;
          depth -= 1;
          if (depth === 0) blocks.push({ end: match.index + match[0].length, start });
        } else {
          if (depth === 0) start = match.index;
          depth += 1;
        }
      }
      return blocks;
    };
    ranges.push(...getNestedBlockRanges('template'));
    for (const tagName of ['i18n', 'docs', 'route', 'config']) {
      ranges.push(...getNestedBlockRanges(tagName));
    }
    for (const opening of source.matchAll(/<script\b/gi)) {
      const openingEnd = findTagEnd(source, opening.index);
      if (openingEnd === -1) continue;
      const closing = source.slice(openingEnd + 1).match(/<\/script(?:[\t\n\r ]+[^>]*)?>/i);
      if (!closing) continue;
      const contentStart = openingEnd + 1;
      const content = source.slice(contentStart, contentStart + closing.index);
      for (const range of getProtectedRanges(content, 'component.ts')) {
        ranges.push({ end: contentStart + range.end, start: contentStart + range.start });
      }
    }
    for (const match of source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style(?:[\t\n\r ]+[^>]*)?>/gi)) {
      ranges.push({ end: match.index + match[0].length, start: match.index });
    }
    return ranges;
  }
  if (extension === '.sh') {
    let start = -1;
    let depth = 0;
    let parameterDepth = 0;
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
      if (character === '\\') {
        index += 1;
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
      } else if (depth > 0 && character === '$' && source[index + 1] === '{') {
        parameterDepth += 1;
        index += 1;
      } else if (
        (character === '(' || character === '{') &&
        (index === 0 || /[\s;|&<>]/.test(source[index - 1]))
      ) {
        start = start === -1 ? index : start;
        depth += 1;
      } else if (depth > 0 && character === '(') {
        depth += 1;
      } else if (depth > 0 && character === '}' && parameterDepth > 0) {
        parameterDepth -= 1;
      } else if (depth > 0 && parameterDepth > 0 && character === ')') {
        continue;
      } else if (depth > 0 && (character === ')' || character === '}')) {
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
    if (extension === '.tsx') return [{ end: source.length, start: 0 }];
    const findTemplateEnd = (start) => {
      let interpolationDepth = 0;
      let interpolationQuote = null;
      let interpolationBlockComment = false;
      let interpolationLineComment = false;
      for (let index = start + 1; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];
        if (interpolationLineComment) {
          if (character === '\n') interpolationLineComment = false;
          continue;
        }
        if (interpolationBlockComment) {
          if (character === '*' && nextCharacter === '/') {
            interpolationBlockComment = false;
            index += 1;
          }
          continue;
        }
        if (interpolationQuote) {
          if (character === '\\') index += 1;
          else if (character === interpolationQuote) interpolationQuote = null;
          continue;
        }
        if (interpolationDepth === 0) {
          if (character === '`') {
            let backslashes = 0;
            for (
              let previous = index - 1;
              previous >= start && source[previous] === '\\';
              previous -= 1
            ) {
              backslashes += 1;
            }
            if (backslashes % 2 === 0) return index;
          }
          if (character === '$' && nextCharacter === '{') {
            interpolationDepth = 1;
            index += 1;
          }
          continue;
        }
        if (character === '/' && nextCharacter === '/') {
          interpolationLineComment = true;
          index += 1;
        } else if (character === '/' && nextCharacter === '*') {
          interpolationBlockComment = true;
          index += 1;
        } else if (character === '"' || character === "'") {
          interpolationQuote = character;
        } else if (character === '{') {
          interpolationDepth += 1;
        } else if (character === '}') {
          interpolationDepth -= 1;
        }
      }
      return source.length - 1;
    };
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
      } else if (
        character === '/' &&
        nextCharacter !== '/' &&
        nextCharacter !== '*' &&
        (index === 0 || /[=(:,!&|?{;[\s]/.test(source[index - 1]))
      ) {
        let inClass = false;
        for (index += 1; index < source.length; index += 1) {
          if (source[index] === '\\') index += 1;
          else if (source[index] === '[') inClass = true;
          else if (source[index] === ']') inClass = false;
          else if (source[index] === '/' && !inClass) {
            if (source[index + 1] === '/' || source[index + 1] === '*') index -= 1;
            break;
          }
        }
      } else if (character === '`') {
        const templateEnd = findTemplateEnd(index);
        ranges.push({ end: templateEnd + 1, start: index });
        index = templateEnd;
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
      node.kind === typescript.SyntaxKind.TemplateHead ||
      node.kind === typescript.SyntaxKind.TemplateMiddle ||
      node.kind === typescript.SyntaxKind.TemplateTail
    ) {
      ranges.push({ end: node.getEnd(), start: node.getStart(sourceFile) });
    }
    if (node.kind === typescript.SyntaxKind.JsxText) {
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
    let quote = null;
    let commentIndex = headerMatch[2].length;
    for (let position = 0; position < headerMatch[2].length; position += 1) {
      const character = headerMatch[2][position];
      if (quote) {
        if (character === '\\' && quote === '"') position += 1;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '#' && (position === 0 || /\s/.test(headerMatch[2][position - 1]))) {
        commentIndex = position;
        break;
      }
    }
    const headerContent = headerMatch[2].slice(0, commentIndex).trim();
    const explicitKeyContent = headerContent.replace(/^\?\s*/, '');
    const valueMatch = explicitKeyContent.match(/^(?:.*?:\s*|-\s*)(.*)$/);
    let scalarValue = (valueMatch ? valueMatch[1] : explicitKeyContent).trim();
    while (scalarValue.startsWith('&') || scalarValue.startsWith('!')) {
      const separator = scalarValue.search(/[\t ]/);
      if (separator === -1) {
        scalarValue = '';
        break;
      }
      scalarValue = scalarValue.slice(separator).trimStart();
    }
    if (!/^[|>](?:[+-]?\d?[+-]?)?$/.test(scalarValue)) continue;
    const keepChomping = scalarValue.includes('+');
    const headerIndent = headerMatch[1].length;
    let contentIndent = null;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (/^[\t \r]*$/.test(candidate)) {
        if (keepChomping) {
          protectedLines.add(next);
          continue;
        }
        const following = lines.slice(next + 1).find((line) => !/^[\t \r]*$/.test(line));
        const followingIndent = following?.match(/^[\t ]*/)?.[0].length;
        if (contentIndent === null || followingIndent >= contentIndent) protectedLines.add(next);
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
const getYamlPlainScalarLines = (lines, filePath) => {
  if (!['.yaml', '.yml'].includes(extname(filePath).toLowerCase())) return new Set();
  const protectedLines = new Set();
  let flowDepth = 0;
  let flowQuote = null;
  let rootContinuationIndent = null;
  const isStructural = (line) => /^\s*(?:[-?](?:\s|$)|[^#\n:]+:\s*|:\s*|---|\.\.\.)/.test(line);
  const updateFlowContext = (line) => {
    for (let position = 0; position < line.length; position += 1) {
      const character = line[position];
      if (flowQuote) {
        if (character === '\\' && flowQuote === '"') position += 1;
        else if (character === flowQuote) flowQuote = null;
      } else if (character === '"' || character === "'") {
        flowQuote = character;
      } else if (character === '#' && (position === 0 || /\s/.test(line[position - 1]))) {
        break;
      } else if (character === '[' || character === '{') {
        flowDepth += 1;
      } else if ((character === ']' || character === '}') && flowDepth > 0) {
        flowDepth -= 1;
      }
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[\t \r]*$/.test(line)) {
      if (flowDepth > 0 || rootContinuationIndent !== null) protectedLines.add(index);
      continue;
    }
    const indent = line.match(/^\s*/)[0].length;
    const rootPlain =
      indent === 0 &&
      !/^(?:---|\.\.\.|[&*!?{}\[\],>-])/.test(line.trim()) &&
      !/^\s*#/.test(line) &&
      !/^[^"']*:\s/.test(line);
    if (rootContinuationIndent !== null) {
      if (indent < rootContinuationIndent || isStructural(line)) rootContinuationIndent = null;
      else protectedLines.add(index);
    }
    if (rootPlain && rootContinuationIndent === null) {
      const following = lines.slice(index + 1).find((entry) => !/^[\t \r]*$/.test(entry));
      const followingIndent = following?.match(/^\s*/)[0].length;
      if (following && followingIndent > 0 && !isStructural(following)) {
        rootContinuationIndent = followingIndent;
      }
    }
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^(\s*)(?:[^\n:]+:\s*|:\s*|[-]\s*)(.*)$/);
    if (!match || !match[2]) {
      const bareSequence = line.match(/^(\s*)-\s*(?:#.*)?$/);
      if (bareSequence) {
        const headerIndent = bareSequence[1].length;
        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next];
          if (/^[\t \r]*$/.test(candidate)) {
            const following = lines.slice(next + 1).find((entry) => !/^[\t \r]*$/.test(entry));
            if (
              following &&
              following.match(/^[\t ]*/)[0].length > headerIndent &&
              !isStructural(following)
            ) {
              protectedLines.add(next);
            }
            continue;
          }
          const candidateIndent = candidate.match(/^\s*/)[0].length;
          if (candidateIndent <= headerIndent || isStructural(candidate)) break;
          protectedLines.add(next);
        }
      }
      updateFlowContext(line);
      continue;
    }
    let scalarValue = match[2].trim();
    while (scalarValue.startsWith('&') || scalarValue.startsWith('!')) {
      const separator = scalarValue.search(/[\t ]/);
      if (separator === -1) {
        scalarValue = '';
        break;
      }
      scalarValue = scalarValue.slice(separator).trimStart();
    }
    if (!scalarValue || /^[|>'"\[\]{]/.test(scalarValue)) {
      updateFlowContext(line);
      continue;
    }
    const headerIndent = match[1].length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (/^[\t \r]*$/.test(candidate)) {
        const following = lines.slice(next + 1).find((entry) => !/^[\t \r]*$/.test(entry));
        if (
          following &&
          following.match(/^[\t ]*/)[0].length > headerIndent &&
          !isStructural(following)
        ) {
          protectedLines.add(next);
        }
        continue;
      }
      const indent = candidate.match(/^\s*/)[0].length;
      if (indent <= headerIndent) break;
      if (isStructural(candidate)) break;
      protectedLines.add(next);
    }
    updateFlowContext(line);
  }
  return protectedLines;
};
const getYamlQuotedLines = (lines, filePath) => {
  if (!['.yaml', '.yml'].includes(extname(filePath).toLowerCase())) return new Set();
  const protectedLines = new Set();
  let quote = null;
  let flowDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (quote && /^[\t \r]*$/.test(line)) protectedLines.add(index);
    for (let position = 0; position < line.length; position += 1) {
      const character = line[position];
      const previous = line[position - 1];
      if (quote === '"') {
        if (character === '\\') position += 1;
        else if (character === '"') quote = null;
        continue;
      }
      if (quote === "'") {
        if (character === "'" && line[position + 1] === "'") position += 1;
        else if (character === "'") quote = null;
        continue;
      }
      if (
        (character === '"' || character === "'") &&
        (position === 0 ||
          /[:\[,]/.test(previous) ||
          /:\s*$/.test(line.slice(0, position)) ||
          /^\s*-\s*$/.test(line.slice(0, position)) ||
          /:\s*(?:[&!]\S+\s+)*$/.test(line.slice(0, position)) ||
          /^\s*(?:\?|-)\s*(?:[&!]\S+\s+)*$/.test(line.slice(0, position)) ||
          flowDepth > 0)
      ) {
        quote = character;
      } else if (character === '[' || character === '{') {
        flowDepth += 1;
      } else if ((character === ']' || character === '}') && flowDepth > 0) {
        flowDepth -= 1;
      }
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
    if (character === '\\') {
      index += 1;
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
    let delimiterQuote = null;
    let delimiterParsed = false;
    while (index < line.length) {
      const character = line[index];
      if (delimiterQuote) {
        if (character === '\\' && delimiterQuote === '"') {
          delimiter += line[index + 1] ?? '';
          index += 2;
        } else if (character === delimiterQuote) {
          delimiterQuote = null;
          index += 1;
        } else {
          delimiter += character;
          index += 1;
        }
      } else if (character === '"' || character === "'") {
        delimiterParsed = true;
        delimiterQuote = character;
        index += 1;
      } else if (character === '$' && (line[index + 1] === '"' || line[index + 1] === "'")) {
        delimiterParsed = true;
        delimiterQuote = line[index + 1];
        index += 2;
      } else if (/[;|&<>\s]/.test(character)) {
        break;
      } else if (character === '\\' && index + 1 < line.length) {
        delimiterParsed = true;
        delimiter += line[index + 1];
        index += 2;
      } else {
        delimiterParsed = true;
        delimiter += character;
        index += 1;
      }
    }
    if (delimiterParsed) heredocs.push({ delimiter, stripTabs });
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
  const yamlLines = ['.yaml', '.yml'].includes(extname(filePath).toLowerCase())
    ? lines.map((line) => line.replace(/\r$/, ''))
    : lines;
  const hasFinalNewline = source.endsWith('\n');
  const lastLine = hasFinalNewline ? lines.length - 1 : lines.length;
  const protectedRanges = getProtectedRanges(source, filePath).sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const yamlScalarLines = getYamlScalarLines(yamlLines, filePath);
  const yamlPlainScalarLines = getYamlPlainScalarLines(yamlLines, filePath);
  const yamlQuotedLines = getYamlQuotedLines(yamlLines, filePath);
  const isCodeFile = ['.cjs', '.js', '.mjs', '.ts', '.tsx', '.vue'].includes(
    extname(filePath).toLowerCase()
  );
  const isShellFile = extname(filePath).toLowerCase() === '.sh';
  const isYamlFile = ['.yaml', '.yml'].includes(extname(filePath).toLowerCase());
  const output = [];
  let blockComment = false;
  let quote = null;
  let heredocs = [];
  let continuedShellLine = null;
  let protectedRangeIndex = 0;
  let removed = 0;
  let offset = 0;
  for (let index = 0; index < lastLine; index += 1) {
    const line = lines[index];
    const isBlank = /^[\t \r]*$/.test(line);
    const followsContinuation = isShellFile && index > 0 && endsWithContinuation(lines[index - 1]);
    while (
      protectedRangeIndex < protectedRanges.length &&
      protectedRanges[protectedRangeIndex].end <= offset
    ) {
      protectedRangeIndex += 1;
    }
    const activeProtectedRange = protectedRanges[protectedRangeIndex];
    const isProtected =
      yamlScalarLines.has(index) ||
      yamlPlainScalarLines.has(index) ||
      yamlQuotedLines.has(index) ||
      (activeProtectedRange?.start <= offset && offset + line.length <= activeProtectedRange.end);
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
      if (isShellFile && character === '#' && (position === 0 || /\s/.test(line[position - 1]))) {
        break;
      }
      if (isShellFile && character === '\\') {
        position += 1;
        continue;
      }
      if (!isShellFile && character === '/' && nextCharacter === '*') {
        blockComment = true;
        position += 1;
      } else if (character === '`' || character === '"' || character === "'") {
        quote = character;
      }
    }
    if (isShellFile && !blockComment && !quote) {
      const logicalLine = continuedShellLine === null ? line : continuedShellLine + line;
      if (endsWithContinuation(line)) {
        continuedShellLine = logicalLine.slice(0, -1);
      } else {
        continuedShellLine = null;
        heredocs = getShellHeredocs(logicalLine);
      }
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
