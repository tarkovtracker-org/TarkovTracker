import { describe, expect, it } from 'vitest';
import { stripBareNodeImports } from '@/utils/stripBareNodeImports';
describe('stripBareNodeImports', () => {
  it('removes bare side-effect node: imports', () => {
    expect(stripBareNodeImports('import "node:process";')).toBe('');
    expect(stripBareNodeImports("import 'node:buffer';")).toBe('');
    expect(stripBareNodeImports('import"node:path";')).toBe('');
    expect(stripBareNodeImports('import "node:process"')).toBe('');
  });
  it('preserves named and namespace node: imports', () => {
    expect(stripBareNodeImports('import x from "node:fs";')).toBe('import x from "node:fs";');
    expect(stripBareNodeImports('import { readFile } from "node:fs";')).toBe(
      'import { readFile } from "node:fs";'
    );
    expect(stripBareNodeImports('import process from "node:process";')).toBe(
      'import process from "node:process";'
    );
    expect(stripBareNodeImports('import * as fs from "node:fs";')).toBe(
      'import * as fs from "node:fs";'
    );
  });
  it('preserves dynamic imports and non-import node: strings', () => {
    expect(stripBareNodeImports('await import("node:fs");')).toBe('await import("node:fs");');
    expect(stripBareNodeImports('const a = "node:process";')).toBe('const a = "node:process";');
  });
  it('strips only bare imports from mixed source', () => {
    const source = [
      'import "node:process";',
      'import { join } from "node:path";',
      'import x from "node:fs";',
      'export const ok = true;',
    ].join('\n');
    expect(stripBareNodeImports(source)).toBe(
      [
        '',
        'import { join } from "node:path";',
        'import x from "node:fs";',
        'export const ok = true;',
      ].join('\n')
    );
  });
  it('returns source unchanged when node: is absent', () => {
    const source = 'export const value = 1;';
    expect(stripBareNodeImports(source)).toBe(source);
  });
});
