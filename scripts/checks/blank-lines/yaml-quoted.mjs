import { isBlank, isQuote } from './shared.mjs';
import { updateFlowDepth } from './yaml-context.mjs';
const quotePrefixes = [
  /:\s*$/,
  /^\s*-\s*$/,
  /:\s*(?:[&!]\S+\s+)*$/,
  /^\s*(?:\?|-)\s*(?:[&!]\S+\s+)*$/,
];
const canOpenQuote = (line, cursor) => {
  if (cursor.index === 0 || cursor.depth > 0) return true;
  if (/[:\[,]/.test(line[cursor.index - 1])) return true;
  const prefix = line.slice(0, cursor.index);
  return quotePrefixes.some((pattern) => pattern.test(prefix));
};
const consumeSingleQuote = (line, cursor) => {
  if (line[cursor.index] !== "'") return;
  if (line[cursor.index + 1] === "'") cursor.index += 1;
  else cursor.quote = null;
};
const consumeQuote = (line, cursor) => {
  if (cursor.quote === "'") consumeSingleQuote(line, cursor);
  else if (line[cursor.index] === '\\') cursor.index += 1;
  else if (line[cursor.index] === '"') cursor.quote = null;
};
const scanCharacter = (line, cursor) => {
  if (cursor.quote) consumeQuote(line, cursor);
  else if (isQuote(line[cursor.index]) && canOpenQuote(line, cursor)) {
    cursor.quote = line[cursor.index];
  } else updateFlowDepth(line[cursor.index], cursor);
};
const scanLine = (line, cursor) => {
  for (cursor.index = 0; cursor.index < line.length; cursor.index += 1) scanCharacter(line, cursor);
};
export const getYamlQuotedLines = (lines) => {
  const protectedLines = new Set();
  const cursor = { depth: 0, index: 0, quote: null };
  for (let index = 0; index < lines.length; index += 1) {
    if (cursor.quote && isBlank(lines[index])) protectedLines.add(index);
    scanLine(lines[index], cursor);
  }
  return protectedLines;
};
