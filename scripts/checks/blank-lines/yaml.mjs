import { getYamlBlockLines } from './yaml-block.mjs';
import { getYamlPlainLines } from './yaml-plain.mjs';
import { getYamlQuotedLines } from './yaml-quoted.mjs';
import { staticProtector } from './shared.mjs';
export const createYamlProtector = (lines) => {
  const normalizedLines = lines.map((line) => line.replace(/\r$/, ''));
  const protectedLines = new Set([
    ...getYamlBlockLines(normalizedLines),
    ...getYamlPlainLines(normalizedLines),
    ...getYamlQuotedLines(normalizedLines),
  ]);
  return staticProtector((line, index) => protectedLines.has(index));
};
