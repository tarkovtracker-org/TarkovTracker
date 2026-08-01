#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const patterns = [
  'app/**/*.{js,ts,tsx,vue,css,md}',
  'app/**/!(*locales)/*.json',
  'docs/**/*.{md,markdown}',
  '*.md',
  '*.{js,mjs,cjs,json}',
  '.github/**/*.md',
  'DESIGN.md',
  'nuxt.config.ts',
  'app/app.config.ts',
  'vitest.config.ts',
  'tests/test-setup.ts',
  'tests/**/*.{ts,tsx}',
  'scripts/**/*.json',
  'supabase/**/*.json',
  'workers/**/*.json',
];
const mode = process.argv[2];
if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: format-files.mjs --check|--write');
  process.exit(1);
}
execFileSync('prettier', [mode, ...patterns], { stdio: 'inherit' });
