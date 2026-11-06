import { consumeQuote, isQuote, skipLineComment } from './shared.mjs';
const isPair = (source, index, pair) => source.slice(index, index + 2) === pair;
const isEscaped = (source, index, start) => {
  let backslashes = 0;
  for (let previous = index - 1; previous >= start && source[previous] === '\\'; previous -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};
const consumeInterpolationComment = (source, cursor) => {
  if (cursor.lineComment) {
    if (source[cursor.index] === '\n') cursor.lineComment = false;
    return;
  }
  if (isPair(source, cursor.index, '*/')) {
    cursor.blockComment = false;
    cursor.index += 1;
  }
};
const scanInterpolationToken = (source, cursor) => {
  const character = source[cursor.index];
  if (isQuote(character)) cursor.quote = character;
  else if (character === '{') cursor.depth += 1;
  else if (character === '}') cursor.depth -= 1;
};
const scanInterpolation = (source, cursor) => {
  if (isPair(source, cursor.index, '//')) {
    cursor.lineComment = true;
    cursor.index += 1;
  } else if (isPair(source, cursor.index, '/*')) {
    cursor.blockComment = true;
    cursor.index += 1;
  } else scanInterpolationToken(source, cursor);
};
const hasComment = (cursor) => cursor.lineComment || cursor.blockComment;
const scanTemplateCharacter = (source, cursor, start) => {
  if (hasComment(cursor)) {
    consumeInterpolationComment(source, cursor);
    return false;
  }
  if (cursor.quote) {
    consumeQuote(source, cursor);
    return false;
  }
  if (cursor.depth > 0) {
    scanInterpolation(source, cursor);
    return false;
  }
  return scanTemplateText(source, cursor, start);
};
const scanTemplateText = (source, cursor, start) => {
  if (source[cursor.index] === '`' && !isEscaped(source, cursor.index, start)) return true;
  if (isPair(source, cursor.index, '${')) {
    cursor.depth = 1;
    cursor.index += 1;
  }
  return false;
};
const findTemplateEnd = (source, start) => {
  const cursor = {
    blockComment: false,
    depth: 0,
    index: start + 1,
    lineComment: false,
    quote: null,
  };
  for (; cursor.index < source.length; cursor.index += 1) {
    if (scanTemplateCharacter(source, cursor, start)) return cursor.index;
  }
  return source.length - 1;
};
const updateRegexClass = (character, cursor) => {
  if (character === '[') cursor.inClass = true;
  else if (character === ']') cursor.inClass = false;
};
const scanRegexCharacter = (source, cursor) => {
  const character = source[cursor.index];
  if (character === '\\') cursor.index += 1;
  else {
    updateRegexClass(character, cursor);
    return character === '/' && !cursor.inClass;
  }
  return false;
};
const commentIntroducers = new Set(['/', '*']);
const skipRegex = (source, start) => {
  const cursor = { inClass: false, index: start + 1 };
  const end = start + source.slice(start).match(/^[^\r\n\u2028\u2029]*/)[0].length;
  for (; cursor.index < end; cursor.index += 1) {
    if (scanRegexCharacter(source, cursor)) return cursor.index;
  }
  return start;
};
const regexKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);
const regexOperators = new Set('=(:,!&|?{;[+-*~%^<>/');
const isRegexContext = (cursor) =>
  regexKeywords.has(cursor.previousToken) || regexOperators.has(cursor.previousToken);
const isRegexStart = (source, cursor) =>
  source[cursor.index] === '/' &&
  !commentIntroducers.has(source[cursor.index + 1]) &&
  isRegexContext(cursor);
const readToken = (source, index) =>
  source.slice(index).match(/^(?:[$A-Z_a-z][$\w]*|\+\+|--)/)?.[0];
const controlConditions = new Set(['catch', 'for', 'if', 'switch', 'while', 'with']);
const readPunctuation = (source, cursor) => {
  const token = source[cursor.index];
  if (token === '(') cursor.parentheses.push(controlConditions.has(cursor.previousToken));
  if (token === ')') return cursor.parentheses.pop() ? ';' : ')';
  return token;
};
const classifyIdentifier = (token, previousToken) => (previousToken === '.' ? 'value' : token);
const recordToken = (source, cursor) => {
  if (/\s/.test(source[cursor.index])) return;
  const token = readToken(source, cursor.index);
  cursor.previousToken = token
    ? classifyIdentifier(token, cursor.previousToken)
    : readPunctuation(source, cursor);
  if (token) cursor.index += token.length - 1;
};
const consumeRegex = (source, cursor) => {
  const end = skipRegex(source, cursor.index);
  cursor.previousToken = end === cursor.index ? '/' : 'value';
  cursor.index = end;
};
const consumeTemplate = (source, cursor, ranges) => {
  const end = findTemplateEnd(source, cursor.index);
  ranges.push({ end: end + 1, start: cursor.index });
  cursor.previousToken = 'value';
  cursor.index = end;
};
const openQuote = (source, cursor) => {
  cursor.quote = source[cursor.index];
  cursor.previousToken = 'value';
};
const consumeBlockComment = (source, cursor, ranges) => {
  const end = source.indexOf('*/', cursor.index + 2);
  if (end !== -1) {
    ranges.push({ end: end + 2, start: cursor.index });
    cursor.index = end + 1;
  }
};
const scanOpening = (source, cursor, ranges) => {
  if (isPair(source, cursor.index, '/*')) {
    consumeBlockComment(source, cursor, ranges);
  } else if (isRegexStart(source, cursor)) {
    consumeRegex(source, cursor);
  } else if (source[cursor.index] === '`') {
    consumeTemplate(source, cursor, ranges);
  } else recordToken(source, cursor);
};
const scanFallbackCharacter = (source, cursor, ranges) => {
  if (cursor.quote) consumeQuote(source, cursor);
  else if (isPair(source, cursor.index, '//')) {
    cursor.index = skipLineComment(source, cursor.index);
  } else if (isQuote(source[cursor.index])) openQuote(source, cursor);
  else scanOpening(source, cursor, ranges);
};
export const getFallbackRanges = (source, extension) => {
  if (extension === '.tsx') return [{ end: source.length, start: 0 }];
  const cursor = { index: 0, parentheses: [], previousToken: ';', quote: null };
  const ranges = [];
  for (; cursor.index < source.length; cursor.index += 1) {
    scanFallbackCharacter(source, cursor, ranges);
  }
  return ranges;
};
