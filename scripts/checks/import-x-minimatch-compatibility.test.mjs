// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { Linter } = require('eslint');
const entry = require.resolve('eslint-plugin-import-x');
it.each(['CommonJS', 'ESM'])(
  'preserves internal import allow and forbid patterns (%s)',
  async (format) => {
    const plugin =
      format === 'CommonJS'
        ? require(entry)
        : (await import(pathToFileURL(entry.replace(/index\.cjs$/, 'index.js')).href)).default;
    const check = (code, options) =>
      new Linter().verify(
        code,
        [
          {
            plugins: { 'import-x': plugin },
            rules: { 'import-x/no-internal-modules': ['error', options] },
          },
        ],
        { filename: 'dependency-regression.js' }
      );
    expect(check('import "vitest/config";', { allow: ['vitest/**'] })).toEqual([]);
    expect(check('import "vitest/config";', { forbid: ['vitest/**'] })).toEqual([
      expect.objectContaining({ ruleId: 'import-x/no-internal-modules', messageId: 'noAllowed' }),
    ]);
    expect(check('import "vitest";', { forbid: ['vitest/**'] })).toEqual([]);
  }
);
