// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanCloudflareOutput, filterAutoImports } from './buildHooks';
vi.mock('node:fs', { spy: true });
describe('cleanCloudflareOutput', () => {
  let root: string;
  const bare = 'import "node:fs";';
  const kept = 'import { join } from "node:path";';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nuxt-output-'));
  });
  afterEach(() => rmSync(root, { force: true, recursive: true }));
  it('rewrites only changed JavaScript files throughout Cloudflare output', () => {
    const nested = join(root, 'chunks.js');
    mkdirSync(nested);
    const files = [join(root, 'entry.js'), join(nested, 'chunk.mjs'), join(nested, 'chunk.cjs')];
    for (const file of files) writeFileSync(file, bare + kept);
    const asset = join(nested, 'chunk.js.map');
    writeFileSync(asset, bare);
    const unchanged = join(root, 'unchanged.js');
    writeFileSync(unchanged, kept);
    utimesSync(unchanged, 1000, 1000);
    cleanCloudflareOutput('node-server', root);
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(files.map(() => bare + kept));
    cleanCloudflareOutput('cloudflare-pages', root);
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(files.map(() => kept));
    expect(readFileSync(asset, 'utf8')).toBe(bare);
    expect(statSync(unchanged).mtimeMs).toBe(1000000);
  });
  it('continues cleaning other files after a write failure', () => {
    writeFileSync(join(root, 'a.js'), bare);
    writeFileSync(join(root, 'b.js'), bare);
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    cleanCloudflareOutput('cloudflare', root);
    const contents = ['a.js', 'b.js'].map((file) => readFileSync(join(root, file), 'utf8'));
    expect(contents.sort()).toEqual(['', bare]);
  });
  it('continues after an output file vanishes and tolerates a missing directory', () => {
    writeFileSync(join(root, 'a.js'), bare);
    writeFileSync(join(root, 'b.js'), bare);
    const read = vi.mocked(readFileSync).getMockImplementation()!;
    vi.mocked(readFileSync).mockImplementationOnce((path, options) => {
      rmSync(String(path));
      return read(path, options);
    });
    cleanCloudflareOutput('cloudflare', root);
    expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), '');
    expect(() => cleanCloudflareOutput('cloudflare', join(root, 'gone'))).not.toThrow();
  });
});
describe('filterAutoImports', () => {
  it('removes matching names or aliases in place and preserves the other entries in order', () => {
    const kept = [
      { name: 'meta', from: '/other/perf' },
      { name: 'getters', from: '/app/stores/useTarkov' },
      { name: 'options' },
      { name: 'keep', as: 'keepAlias', from: '/app/utils/constants' },
    ];
    const imports = [
      ...kept.slice(0, 2),
      { name: 'meta', as: 'renamed', from: '/root/app/utils/perf.ts' },
      { name: 'other', as: 'string', from: '/app/utils/constants' },
      { name: 'string', from: '/app/utils/mapTime' },
      { name: 'string', from: '/app/utils/skillHelpers' },
      { name: 'actions', from: '/app/stores/useApp' },
      { name: 'getters', from: '/app/stores/useApp' },
      { name: 'actions', from: '/app/stores/useTarkov' },
      { name: 'options', from: '/node_modules/@nuxt/ui/dist/runtime/composables/useResizable.js' },
      ...kept.slice(2),
    ];
    filterAutoImports(imports);
    expect(imports).toEqual(kept);
    kept.forEach((entry, index) => expect(imports[index]).toBe(entry));
  });
});
