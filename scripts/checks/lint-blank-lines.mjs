#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { stripBlankLines } from './blank-lines/index.mjs';
const FIX = process.argv.includes('--fix');
const requestedFiles = process.argv.slice(2).filter((argument) => argument !== '--fix');
const root = process.cwd();
const supportedExtensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml',
]);
const excludedFiles = new Set([
  '.coderabbit.yaml',
  'pnpm-lock.yaml',
  'supabase/functions/_shared/database.types.ts',
]);
const excludedLocalePattern = /^app\/locales\/(?!en\.json$)[^/]+\.json$/;
const excludedDirectories = ['.git/', '.nuxt/', 'coverage/', 'dist/', 'node_modules/'];
const normalizePath = (filePath) => filePath.replaceAll('\\', '/');
const isExcludedDirectory = (filePath, directory) =>
  filePath.startsWith(directory) || filePath.includes(`/${directory}`);
const isExcludedFile = (filePath) =>
  excludedFiles.has(filePath) || excludedLocalePattern.test(filePath);
const isCandidate = (filePath) => {
  const normalizedPath = normalizePath(filePath);
  const extension = extname(normalizedPath).toLowerCase();
  return (
    !isExcludedFile(normalizedPath) &&
    !excludedDirectories.some((directory) => isExcludedDirectory(normalizedPath, directory)) &&
    supportedExtensions.has(extension)
  );
};
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const trackedSymlinks = new Set(
  execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.startsWith('120000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1))
);
const files = (requestedFiles.length ? requestedFiles : trackedFiles())
  .map((filePath) => relative(root, resolve(root, filePath)))
  .filter(isCandidate);
let changedFiles = 0;
let removedLines = 0;
for (const filePath of files) {
  const absolutePath = resolve(root, filePath);
  let original;
  try {
    if (trackedSymlinks.has(normalizePath(filePath))) continue;
    original = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const result = stripBlankLines(original, filePath, {
    typescript: process.env.LINT_BLANK_LINES_FORCE_FALLBACK ? null : undefined,
  });
  if (result.removed === 0) continue;
  changedFiles += 1;
  removedLines += result.removed;
  if (FIX) writeFileSync(absolutePath, result.source);
  console.log(`${FIX ? 'fixed' : 'blank lines'} ${filePath}: ${result.removed}`);
}
if (!FIX && changedFiles > 0) {
  console.error(`Found ${removedLines} removable blank line(s) in ${changedFiles} file(s).`);
  process.exitCode = 1;
}
