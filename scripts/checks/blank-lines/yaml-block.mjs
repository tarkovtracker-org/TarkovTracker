import { isBlank } from './shared.mjs';
import {
  commentStart,
  followingContent,
  indentOf,
  spaceIndentOf,
  stripDecorators,
} from './yaml-context.mjs';
const scalarBaseIndent = (content, indent) => {
  const sequenceMapping = content.match(/^(?:-[\t ]+)+(?=.*?:\s)/);
  return sequenceMapping ? indent + sequenceMapping[0].length : indent;
};
const explicitContentIndent = (value, content, indent) => {
  const indicator = value.match(/[1-9]/);
  return indicator ? scalarBaseIndent(content, indent) + Number(indicator[0]) : null;
};
const getScalarHeader = (line) => {
  const match = line.match(/^(\s*)(.*)$/);
  if (!match) return null;
  const content = match[2]
    .slice(0, commentStart(match[2]))
    .trim()
    .replace(/^\?\s*/, '');
  const valueMatch = content.match(/^(?:.*?:\s*|-\s*)(.*)$/);
  const value = stripDecorators((valueMatch ? valueMatch[1] : content).trim());
  if (!/^[|>](?:[+-]?\d?[+-]?)?$/.test(value)) return null;
  return {
    contentIndent: explicitContentIndent(value, content, match[1].length),
    indent: match[1].length,
    keepChomping: value.includes('+'),
  };
};
const protectsBlank = (lines, index, scalar) => {
  if (scalar.keepChomping) return true;
  const following = followingContent(lines, index);
  const followingIndent = following === undefined ? undefined : spaceIndentOf(following);
  return scalar.contentIndent === null || followingIndent >= scalar.contentIndent;
};
const endsScalar = (indent, scalar) => {
  if (indent <= scalar.indent) return true;
  return scalar.contentIndent !== null && indent < scalar.contentIndent;
};
const protectBlankLine = (lines, index, scalar, protectedLines) => {
  if (protectsBlank(lines, index, scalar)) protectedLines.add(index);
};
const protectScalarLine = (lines, index, scalar, protectedLines) => {
  const line = lines[index];
  if (isBlank(line)) {
    protectBlankLine(lines, index, scalar, protectedLines);
    return true;
  }
  const indent = indentOf(line);
  if (endsScalar(indent, scalar)) return false;
  if (scalar.contentIndent === null) {
    scalar.contentIndent = indent;
  }
  protectedLines.add(index);
  return true;
};
const protectScalar = (lines, index, scalar, protectedLines) => {
  for (let next = index + 1; next < lines.length; next += 1) {
    if (!protectScalarLine(lines, next, scalar, protectedLines)) break;
  }
};
export const getYamlBlockLines = (lines) => {
  const protectedLines = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const scalar = getScalarHeader(lines[index]);
    if (scalar) protectScalar(lines, index, scalar, protectedLines);
  }
  return protectedLines;
};
