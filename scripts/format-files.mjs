#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const patterns = [
  'app/**/*.{js,ts,tsx,vue,css,md}',
  'app/**/!(*locales)/*.json',
  'app/locales/en.json',
  'docs/**/*.{md,markdown}',
  '*.md',
  '*.{js,mjs,cjs,json}',
  '.github/**/*.md',
  'DESIGN.md',
  'nuxt.config.ts',
  'app/app.config.ts',
  'vitest*.ts',
  'tests/test-setup.ts',
  'tests/**/*.{ts,tsx}',
  'scripts/**/*.json',
  'scripts/**/*.{cjs,js,mjs}',
  'supabase/**/*.json',
  'workers/**/*.json',
];
const mode = process.argv[2];
if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: format-files.mjs --check|--write');
  process.exit(1);
}
const localPrettier = resolve(
  process.cwd(),
  'node_modules/.bin',
  process.platform === 'win32' ? 'prettier.cmd' : 'prettier'
);
execFileSync(localPrettier, [mode, ...patterns], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
