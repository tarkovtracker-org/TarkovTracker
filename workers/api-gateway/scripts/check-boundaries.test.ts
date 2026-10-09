import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBoundaries, inspectImports } from './check-boundaries.mjs';
const root = resolve('boundary-fixture/src');
const file = resolve(root, 'rules.ts');
describe('runtime import boundaries', () => {
  it('checks compiled release exports even when their source is runtime-free', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'contracts-boundary-'));
    for (const folder of ['gateway/src', 'contracts/src', 'contracts/dist'])
      mkdirSync(join(fixture, folder), { recursive: true });
    writeFileSync(join(fixture, 'gateway/tsconfig.json'), '{"compilerOptions":{"paths":{}}}');
    writeFileSync(join(fixture, 'contracts/src/rule.ts'), 'export const value = 1;');
    const entry = join(fixture, 'contracts/dist/rule.js');
    writeFileSync(entry, "import { readFile } from 'node:fs'; export const value = readFile;");
    expect(checkBoundaries(join(fixture, 'gateway'), entry)).toEqual([
      `${entry}: forbidden import node:fs`,
    ]);
  });
  it.each([
    "import { rule } from '../../app/rules';",
    "export { rule } from '../../shared/rules';",
    "import type { Rule } from '../../app/types';",
    "const rule = import('../../supabase/rules');",
    'const rule = import(path);',
    "const rule = require('../../app/rules');",
    "import rule = require('../../app/rules');",
    "import { ref } from 'vue';",
    "import { rule } from '@shared/utils/rules';",
  ])('rejects a forbidden dependency: %s', (source) => {
    expect(inspectImports(source, file, root, () => false)).toHaveLength(1);
  });
  it('allows local contract imports', () => {
    expect(inspectImports("import { rule } from './rules.js';", file, root, () => false)).toEqual(
      []
    );
  });
});
