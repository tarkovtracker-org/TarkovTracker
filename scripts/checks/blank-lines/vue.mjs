import { getJavaScriptRanges } from './javascript.mjs';
import { consumeQuote, isQuote } from './shared.mjs';
const findTagEnd = (source, start) => {
  const cursor = { index: start, quote: null };
  for (; cursor.index < source.length; cursor.index += 1) {
    if (scanTagCharacter(source, cursor)) return cursor.index;
  }
  return -1;
};
const scanTagCharacter = (source, cursor) => {
  const character = source[cursor.index];
  if (cursor.quote) consumeQuote(source, cursor);
  else if (isQuote(character)) cursor.quote = character;
  else if (character === '>') return true;
  return false;
};
const getTagBlocks = (source, tagName) => {
  const blocks = [];
  for (const opening of source.matchAll(new RegExp(`<${tagName}\\b`, 'gi'))) {
    const openingEnd = findTagEnd(source, opening.index);
    if (openingEnd === -1) continue;
    const closing = source
      .slice(openingEnd + 1)
      .match(new RegExp(`</${tagName}(?:[\\t\\n\\r ]+[^>]*)?>`, 'i'));
    if (!closing) continue;
    blocks.push({
      contentEnd: openingEnd + 1 + closing.index,
      contentStart: openingEnd + 1,
      end: openingEnd + 1 + closing.index + closing[0].length,
      start: opening.index,
    });
  }
  return blocks;
};
const closeNestedBlock = (match, state, blocks) => {
  if (state.depth === 0) return;
  state.depth -= 1;
  if (state.depth === 0) blocks.push({ end: match.index + match[0].length, start: state.start });
};
const updateNestedBlock = (match, state, blocks) => {
  if (match[0].startsWith('</')) closeNestedBlock(match, state, blocks);
  else {
    if (state.depth === 0) state.start = match.index;
    state.depth += 1;
  }
};
const getNestedBlockRanges = (source, tagName, ignoredRanges) => {
  const blocks = [];
  const state = { depth: 0, start: -1 };
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  for (const match of source.matchAll(tags)) {
    if (ignoredRanges.some((range) => range.start <= match.index && match.index < range.end))
      continue;
    updateNestedBlock(match, state, blocks);
  }
  return blocks;
};
const getScriptRanges = (source, blocks, typescript) => {
  const ranges = [];
  for (const block of blocks) {
    const content = source.slice(block.contentStart, block.contentEnd);
    for (const range of getJavaScriptRanges(content, 'component.ts', '.ts', typescript)) {
      ranges.push({ end: block.contentStart + range.end, start: block.contentStart + range.start });
    }
  }
  return ranges;
};
export const getVueRanges = (source, typescript) => {
  const scripts = getTagBlocks(source, 'script');
  const ignoredRanges = [...scripts, ...getTagBlocks(source, 'style')];
  const ranges = ['template', 'i18n', 'docs', 'route', 'config'].flatMap((tagName) =>
    getNestedBlockRanges(source, tagName, ignoredRanges)
  );
  ranges.push(...getScriptRanges(source, scripts, typescript));
  for (const match of source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style(?:[\t\n\r ]+[^>]*)?>/gi)) {
    ranges.push({ end: match.index + match[0].length, start: match.index });
  }
  return ranges;
};
