import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectImports } from './check-boundaries.mjs';
const root = resolve('boundary-fixture/src');
const file = resolve(root, 'rules.ts');
describe('runtime import boundaries', () => {
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
