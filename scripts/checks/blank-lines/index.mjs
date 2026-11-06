import { extname } from 'node:path';
import { getJavaScriptRanges } from './javascript.mjs';
import { createTextProtector } from './other.mjs';
import { createShellProtector } from './shell.mjs';
import { isBlank, rangeProtector, staticProtector } from './shared.mjs';
import { getVueRanges } from './vue.mjs';
import { createYamlProtector } from './yaml.mjs';
let defaultTypescript;
try {
  defaultTypescript = (await import('typescript')).default;
} catch {
  defaultTypescript = null;
}
const javascriptExtensions = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const codeExtensions = new Set([...javascriptExtensions, '.vue']);
const yamlExtensions = new Set(['.yaml', '.yml']);
const protectRanges = (ranges) => {
  const inRange = rangeProtector(ranges);
  return staticProtector((line, index, offset) => inRange(line, offset));
};
const createProtector = (source, filePath, lines, typescript) => {
  const extension = extname(filePath).toLowerCase();
  if (codeExtensions.has(extension)) {
    return protectRanges(getCodeRanges(source, filePath, extension, typescript));
  }
  if (extension === '.sh') return createShellProtector(source, lines);
  if (yamlExtensions.has(extension)) return createYamlProtector(lines);
  return createTextProtector();
};
const getCodeRanges = (source, filePath, extension, typescript) => {
  if (extension === '.vue') return getVueRanges(source, typescript);
  return getJavaScriptRanges(source, filePath, extension, typescript);
};
const removeLines = (lines, lastLine, protector) => {
  const output = [];
  let offset = 0;
  let removed = 0;
  for (let index = 0; index < lastLine; index += 1) {
    const line = lines[index];
    if (isBlank(line) && !protector.protects(line, index, offset)) removed += 1;
    else {
      output.push(line);
      protector.scan(line);
    }
    offset += line.length + 1;
  }
  return { output, removed };
};
export const stripBlankLines = (source, filePath, { typescript = defaultTypescript } = {}) => {
  if (/^[\t \r\n]*$/.test(source)) return { removed: 0, source };
  const lines = source.split('\n');
  const hasFinalNewline = source.endsWith('\n');
  const lastLine = hasFinalNewline ? lines.length - 1 : lines.length;
  const protector = createProtector(source, filePath, lines, typescript);
  const { output, removed } = removeLines(lines, lastLine, protector);
  return { removed, source: output.join('\n') + (hasFinalNewline ? '\n' : '') };
};
