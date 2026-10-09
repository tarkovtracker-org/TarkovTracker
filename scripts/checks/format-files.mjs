#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const patterns = [
  'app/**/*.{js,ts,tsx,vue,css,md}',
  'app/**/!(*locales)/*.json',
  'app/locales/en.json',
  'docs/**/*.{md,markdown}',
  '*.md',
  '*.{js,mjs,cjs,json}',
  '.github/**/*.md',
  '**/{AGENTS,CLAUDE}.md',
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
const require = createRequire(import.meta.url);
const localPrettier = resolve(
  dirname(require.resolve('prettier/package.json')),
  'bin/prettier.cjs'
);
try {
  execFileSync(process.execPath, [localPrettier, mode, ...patterns], {
    stdio: 'inherit',
  });
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
