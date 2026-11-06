import { isBlank, isShellComment } from './shared.mjs';
import { consumeYamlQuote, isQuoteStart, updateFlowDepth } from './yaml-context.mjs';
const scanCharacter = (line, cursor) => {
  if (cursor.quote) consumeYamlQuote(line, cursor);
  else if (isShellComment(line, cursor.index)) cursor.index = line.length;
  else if (isQuoteStart(line, cursor)) {
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
