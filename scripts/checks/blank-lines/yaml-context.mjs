import { isBlank, isQuote, isShellComment } from './shared.mjs';
export const indentOf = (line) => line.match(/^\s*/)[0].length;
export const spaceIndentOf = (line) => line.match(/^[\t ]*/)[0].length;
export const isStructural = (line) =>
  /^\s*(?:[-?](?:\s|$)|[^#\n:]+:\s*|:\s*|---|\.\.\.)/.test(line);
export const followingContent = (lines, index) =>
  lines.slice(index + 1).find((line) => !isBlank(line));
export const stripDecorators = (value) => {
  while (value.startsWith('&') || value.startsWith('!')) {
    const separator = value.search(/[\t ]/);
    if (separator === -1) return '';
    value = value.slice(separator).trimStart();
  }
  return value;
};
const consumeFlowQuote = (line, cursor) => {
  if (line[cursor.index] === '\\' && cursor.quote === '"') cursor.index += 1;
  else if (line[cursor.index] === cursor.quote) cursor.quote = null;
};
export const commentStart = (line) => {
  const cursor = { index: 0, quote: null };
  for (; cursor.index < line.length; cursor.index += 1) {
    if (scanHeaderCharacter(line, cursor)) return cursor.index;
  }
  return line.length;
};
const scanHeaderCharacter = (line, cursor) => {
  if (cursor.quote) consumeFlowQuote(line, cursor);
  else if (isQuote(line[cursor.index])) cursor.quote = line[cursor.index];
  else if (isShellComment(line, cursor.index)) return true;
  return false;
};
const openingBrackets = new Set(['[', '{']);
const closingBrackets = new Set([']', '}']);
export const updateFlowDepth = (character, state) => {
  if (openingBrackets.has(character)) state.depth += 1;
  else if (closingBrackets.has(character) && state.depth > 0) state.depth -= 1;
};
const scanFlowCharacter = (line, state) => {
  const character = line[state.index];
  if (state.quote) consumeFlowQuote(line, state);
  else if (isQuote(character)) state.quote = character;
  else if (isShellComment(line, state.index)) state.index = line.length;
  else updateFlowDepth(character, state);
};
export const updateFlowContext = (line, state) => {
  for (state.index = 0; state.index < line.length; state.index += 1) {
    scanFlowCharacter(line, state);
  }
};
