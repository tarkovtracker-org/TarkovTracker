import { isBlank } from './shared.mjs';
import {
  followingContent,
  indentOf,
  isStructural,
  spaceIndentOf,
  stripDecorators,
  updateFlowContext,
} from './yaml-context.mjs';
const isComment = (line) => /^\s*#/.test(line);
const isRootPlain = (line) => {
  if (indentOf(line) !== 0 || isComment(line)) return false;
  return !/^(?:---|\.\.\.|[&*!?{}\[\],>-])/.test(line.trim()) && !/^[^"']*:\s/.test(line);
};
const endsContinuation = (line, indent) => indentOf(line) < indent || isStructural(line);
const continueRootPlain = (line, state, protectedLines, index) => {
  if (state.rootIndent === null) return;
  if (endsContinuation(line, state.rootIndent)) state.rootIndent = null;
  else protectedLines.add(index);
};
const isIndentedContent = (line) => indentOf(line) > 0 && !isStructural(line);
const startsRootContinuation = (line, state) => isRootPlain(line) && state.rootIndent === null;
const startRootPlain = (lines, index, state) => {
  if (!startsRootContinuation(lines[index], state)) return;
  const following = followingContent(lines, index);
  if (following && isIndentedContent(following)) state.rootIndent = indentOf(following);
};
const isNestedPlain = (line, headerIndent) =>
  spaceIndentOf(line) > headerIndent && !isStructural(line);
const protectsBlank = (lines, index, headerIndent) => {
  const following = followingContent(lines, index);
  return following && isNestedPlain(following, headerIndent);
};
const endsPlain = (line, headerIndent) => indentOf(line) <= headerIndent || isStructural(line);
const protectContinuationLine = (lines, index, headerIndent, protectedLines) => {
  const line = lines[index];
  if (isBlank(line)) {
    if (protectsBlank(lines, index, headerIndent)) protectedLines.add(index);
    return true;
  }
  if (endsPlain(line, headerIndent)) return false;
  protectedLines.add(index);
  return true;
};
const protectContinuation = (lines, index, headerIndent, protectedLines) => {
  for (let next = index + 1; next < lines.length; next += 1) {
    if (!protectContinuationLine(lines, next, headerIndent, protectedLines)) break;
  }
};
const isPlainValue = (value) => value && !/^[|>'"\[\]{]/.test(value);
const getValueIndent = (match) => {
  const value = stripDecorators(match[2].trim());
  return isPlainValue(value) ? match[1].length : null;
};
const getPlainHeader = (line) => {
  const match = line.match(/^(\s*)(?:[^\n:]+:\s*|:\s*|[-]\s*)(.*)$/);
  if (match?.[2]) {
    return getValueIndent(match);
  }
  const bareSequence = line.match(/^(\s*)-\s*(?:#.*)?$/);
  return bareSequence ? bareSequence[1].length : null;
};
const scanPlainLine = (lines, index, state, protectedLines) => {
  const line = lines[index];
  continueRootPlain(line, state, protectedLines, index);
  startRootPlain(lines, index, state);
  if (isComment(line)) return;
  const headerIndent = getPlainHeader(line);
  if (headerIndent !== null) protectContinuation(lines, index, headerIndent, protectedLines);
  updateFlowContext(line, state);
};
const hasPlainContext = (state) => state.depth > 0 || state.rootIndent !== null;
export const getYamlPlainLines = (lines) => {
  const protectedLines = new Set();
  const state = { depth: 0, index: 0, quote: null, rootIndent: null };
  for (let index = 0; index < lines.length; index += 1) {
    if (isBlank(lines[index])) {
      if (hasPlainContext(state)) protectedLines.add(index);
    } else scanPlainLine(lines, index, state, protectedLines);
  }
  return protectedLines;
};
