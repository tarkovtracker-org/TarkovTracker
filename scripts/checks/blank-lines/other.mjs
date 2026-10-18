import { consumeQuote, consumeShellPrefix, isQuote } from './shared.mjs';
const consumeBlockComment = (line, cursor) => {
  if (line[cursor.index] === '*' && line[cursor.index + 1] === '/') {
    cursor.blockComment = false;
    cursor.index += 1;
  }
};
const scanCharacter = (line, cursor, scanOpening) => {
  if (cursor.quote) return consumeQuote(line, cursor);
  if (cursor.blockComment) return consumeBlockComment(line, cursor);
  scanOpening(line, cursor);
};
const scanShellOpening = (line, cursor) => {
  if (consumeShellPrefix(line, cursor)) return;
  if (line[cursor.index] === '`') cursor.quote = '`';
};
const scanTextOpening = (line, cursor) => {
  const character = line[cursor.index];
  if (line.slice(cursor.index, cursor.index + 2) === '/*') {
    cursor.blockComment = true;
    cursor.index += 1;
  } else if (character === '`' || isQuote(character)) {
    cursor.quote = character;
  }
};
export const createTextProtector = (shell = false) => {
  const cursor = { blockComment: false, index: 0, quote: null };
  const scanOpening = shell ? scanShellOpening : scanTextOpening;
  return {
    protects: () => cursor.blockComment || Boolean(cursor.quote),
    scan(line) {
      for (cursor.index = 0; cursor.index < line.length; cursor.index += 1) {
        scanCharacter(line, cursor, scanOpening);
      }
    },
  };
};
