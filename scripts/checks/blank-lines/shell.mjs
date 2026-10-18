import { createTextProtector } from './other.mjs';
import { getShellHeredocs } from './shell-heredoc.mjs';
import {
  consumeShellQuote,
  consumeShellPrefix,
  endsWithContinuation,
  rangeProtector,
} from './shared.mjs';
const scanShellOpening = (line, cursor) => {
  if (consumeShellPrefix(line, cursor)) return;
  if (line[cursor.index] === '`') cursor.quote = '`';
};
const openGroup = (cursor) => {
  if (cursor.start === -1) cursor.start = cursor.index;
  cursor.depth += 1;
};
const isGroupBoundary = (source, index) => index === 0 || /[\s;|&<>]/.test(source[index - 1]);
const scanDollarOpening = (source, cursor) => {
  const pair = source.slice(cursor.index, cursor.index + 2);
  if (pair === '$(') {
    openGroup(cursor);
    cursor.index += 1;
  } else if (cursor.depth > 0 && pair === '${') {
    cursor.parameterDepth += 1;
    cursor.index += 1;
  } else return false;
  return true;
};
const openingGroups = new Set(['(', '{']);
const closingGroups = new Set([')', '}']);
const isBoundaryOpening = (source, cursor) =>
  openingGroups.has(source[cursor.index]) && isGroupBoundary(source, cursor.index);
const isNestedParenthesis = (source, cursor) => cursor.depth > 0 && source[cursor.index] === '(';
const scanGroupOpening = (source, cursor) => {
  if (scanDollarOpening(source, cursor)) return true;
  if (isBoundaryOpening(source, cursor)) openGroup(cursor);
  else if (isNestedParenthesis(source, cursor)) cursor.depth += 1;
  else return false;
  return true;
};
const consumeParameterClose = (character, cursor) => {
  if (cursor.parameterDepth === 0) return false;
  if (character === '}') {
    cursor.parameterDepth -= 1;
    return true;
  }
  return character === ')';
};
const closeGroup = (cursor, ranges) => {
  cursor.depth -= 1;
  if (cursor.depth === 0) {
    ranges.push({ end: cursor.index + 1, start: cursor.start });
    cursor.start = -1;
  }
};
const scanGroupClosing = (source, cursor, ranges) => {
  if (cursor.depth === 0) return;
  const character = source[cursor.index];
  if (consumeParameterClose(character, cursor)) return;
  if (closingGroups.has(character)) closeGroup(cursor, ranges);
};
const scanGroupCharacter = (source, cursor, ranges) => {
  if (cursor.quote) consumeShellQuote(source, cursor);
  else if (!consumeShellPrefix(source, cursor)) scanGroupMarker(source, cursor, ranges);
};
const scanGroupMarker = (source, cursor, ranges) => {
  if (!scanGroupOpening(source, cursor)) scanGroupClosing(source, cursor, ranges);
};
const getShellRanges = (source) => {
  const ranges = [];
  const cursor = { depth: 0, index: 0, parameterDepth: 0, quote: null, start: -1 };
  for (; cursor.index < source.length; cursor.index += 1) {
    scanGroupCharacter(source, cursor, ranges);
  }
  return ranges;
};
const consumeHeredocLine = (line, heredocs) => {
  const heredoc = heredocs[0];
  const terminator = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
  if (terminator.replace(/\r$/, '') === heredoc.delimiter) heredocs.shift();
};
const followsContinuation = (lines, index) => index > 0 && endsWithContinuation(lines[index - 1]);
const appendContinuation = (continuedLine, line) =>
  continuedLine === null ? line : continuedLine + line;
export const createShellProtector = (source, lines) => {
  const inRange = rangeProtector(getShellRanges(source));
  const text = createTextProtector(scanShellOpening, consumeShellQuote);
  let heredocs = [];
  let continuedLine = null;
  return {
    protects(line, index, offset) {
      if (heredocs.length > 0 || text.protects()) return true;
      if (followsContinuation(lines, index)) return true;
      return inRange(line, offset);
    },
    scan(line) {
      if (heredocs.length > 0) {
        consumeHeredocLine(line, heredocs);
        return;
      }
      text.scan(line);
      if (text.protects()) return;
      const logicalLine = appendContinuation(continuedLine, line);
      if (endsWithContinuation(line)) continuedLine = logicalLine.slice(0, -1);
      else {
        continuedLine = null;
        heredocs = getShellHeredocs(logicalLine);
      }
    },
  };
};
