export const isBlank = (line) => /^[\t \r]*$/.test(line);
export const isQuote = (character) => character === '"' || character === "'";
export const isShellComment = (source, index) =>
  source[index] === '#' && (index === 0 || /\s/.test(source[index - 1]));
export const consumeQuote = (source, cursor) => {
  if (source[cursor.index] === '\\') cursor.index += 1;
  else if (source[cursor.index] === cursor.quote) cursor.quote = null;
};
export const consumeShellQuote = (source, cursor) => {
  if (cursor.quote !== "'" || cursor.ansiQuote) return consumeQuote(source, cursor);
  if (source[cursor.index] === "'") cursor.quote = null;
};
export const skipLineComment = (source, index) => {
  while (index < source.length && source[index] !== '\n') index += 1;
  return index;
};
const hasAnsiQuotePrefix = (source, index) => {
  if (source[index - 1] !== '$') return false;
  let previous = index - 2;
  while (source[previous] === '\\') previous -= 1;
  return (index - 2 - previous) % 2 === 0;
};
const openShellQuote = (source, cursor) => {
  cursor.quote = source[cursor.index];
  cursor.ansiQuote = hasAnsiQuotePrefix(source, cursor.index);
};
export const consumeShellPrefix = (source, cursor) => {
  const character = source[cursor.index];
  if (isShellComment(source, cursor.index)) {
    cursor.index = skipLineComment(source, cursor.index);
  } else if (character === '\\') cursor.index += 1;
  else if (isQuote(character)) {
    openShellQuote(source, cursor);
  } else return false;
  return true;
};
export const endsWithContinuation = (line) => {
  let backslashes = 0;
  for (let index = line.length - 1; index >= 0 && line[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};
const containsLine = (range, line, offset) =>
  range?.start <= offset && offset + line.length <= range.end;
export const rangeProtector = (ranges) => {
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  let index = 0;
  return (line, offset) => {
    while (index < ranges.length && ranges[index].end <= offset) index += 1;
    return containsLine(ranges[index], line, offset);
  };
};
export const staticProtector = (protects) => ({ protects, scan() {} });
