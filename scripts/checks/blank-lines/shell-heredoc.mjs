import { consumeShellQuote, consumeShellPrefix, isQuote } from './shared.mjs';
const isArithmeticStart = (line, index) => {
  if (line.slice(index, index + 3) === '$((') return true;
  return line.slice(index, index + 2) === '((' && (index === 0 || /[\s;]/.test(line[index - 1]));
};
const consumeQuotedDelimiter = (line, cursor) => {
  const character = line[cursor.index];
  if (character === '\\' && cursor.quote === '"') {
    cursor.delimiter += line.slice(cursor.index + 1, cursor.index + 2);
    cursor.index += 2;
  } else if (character === cursor.quote) {
    cursor.quote = null;
    cursor.index += 1;
  } else {
    cursor.delimiter += character;
    cursor.index += 1;
  }
};
const openDelimiterQuote = (line, cursor) => {
  if (isQuote(line[cursor.index])) {
    cursor.parsed = true;
    cursor.quote = line[cursor.index];
    cursor.index += 1;
    return true;
  }
  if (line[cursor.index] === '$' && isQuote(line[cursor.index + 1])) {
    cursor.parsed = true;
    cursor.quote = line[cursor.index + 1];
    cursor.index += 2;
    return true;
  }
  return false;
};
const consumeDelimiter = (line, cursor) => {
  if (cursor.quote) {
    consumeQuotedDelimiter(line, cursor);
    return true;
  }
  if (openDelimiterQuote(line, cursor)) return true;
  if (/[;|&<>\s]/.test(line[cursor.index])) return false;
  consumeBareDelimiter(line, cursor);
  return true;
};
const consumeBareDelimiter = (line, cursor) => {
  cursor.parsed = true;
  if (line[cursor.index] === '\\' && cursor.index + 1 < line.length) {
    cursor.delimiter += line[cursor.index + 1];
    cursor.index += 2;
  } else {
    cursor.delimiter += line[cursor.index];
    cursor.index += 1;
  }
};
const findDelimiterStart = (line, state) => {
  state.index += 2;
  const stripTabs = line[state.index] === '-';
  if (stripTabs) state.index += 1;
  while (/\s/.test(line.slice(state.index, state.index + 1))) state.index += 1;
  return stripTabs;
};
const readDelimiter = (line, start) => {
  const cursor = { delimiter: '', index: start, parsed: false, quote: null };
  while (cursor.index < line.length) {
    if (!consumeDelimiter(line, cursor)) break;
  }
  return cursor;
};
const parseHeredoc = (line, state, heredocs) => {
  const stripTabs = findDelimiterStart(line, state);
  const cursor = readDelimiter(line, state.index);
  if (cursor.parsed) heredocs.push({ delimiter: cursor.delimiter, stripTabs });
  state.index = cursor.index;
};
const scanHeredocOpening = (line, cursor, heredocs) => {
  if (isArithmeticStart(line, cursor.index)) {
    cursor.arithmeticDepth = 2;
    cursor.index += 2;
  } else if (line.slice(cursor.index, cursor.index + 2) === '<<') {
    parseHeredoc(line, cursor, heredocs);
  }
};
const consumeArithmetic = (character, cursor) => {
  if (character === '(') cursor.arithmeticDepth += 1;
  else if (character === ')') cursor.arithmeticDepth -= 1;
};
const scanHeredocCharacter = (line, cursor, heredocs) => {
  if (cursor.arithmeticDepth > 0) {
    consumeArithmetic(line[cursor.index], cursor);
  } else if (cursor.quote) {
    consumeShellQuote(line, cursor);
  } else if (!consumeShellPrefix(line, cursor)) scanHeredocOpening(line, cursor, heredocs);
};
export const getShellHeredocs = (line) => {
  const heredocs = [];
  const cursor = { arithmeticDepth: 0, index: 0, quote: null };
  for (; cursor.index < line.length; cursor.index += 1) {
    scanHeredocCharacter(line, cursor, heredocs);
  }
  return heredocs;
};
