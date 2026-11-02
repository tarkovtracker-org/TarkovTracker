// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const from = (parent, name) => createRequire(parent).resolve(`${name}/package.json`);
const server = from(require.resolve('nuxt/package.json'), '@nuxt/nitro-server');
const nitro = from(server, 'nitropack');
const consumer = from(nitro, '@vercel/nft');
it.each(['CommonJS', 'ESM'])(
  'loads the source-reviewed glob entry through Nitro (%s)',
  (format) => {
    const root = mkdtempSync(join(tmpdir(), 'glob-source-'));
    try {
      writeFileSync(join(root, 'one.txt'), 'fixture');
      writeFileSync(join(root, 'two.js'), 'fixture');
      const loader =
        format === 'CommonJS'
          ? `const require=createRequire(import.meta.url);const resolve=(name)=>require.resolve(name);const load=(name)=>require(name);`
          : `const resolve=(name)=>import.meta.resolve(name);const load=(name)=>import(name);`;
      const script = `import assert from 'node:assert/strict';import{createRequire}from'node:module';
      ${loader}
      assert.equal(resolve('glob'),resolve('glob/raw'),'default glob entry must be the reviewed raw module');
      const {globSync}=await load('glob');
      console.log(JSON.stringify(globSync('*.txt',{cwd:process.env.GLOB_COMPAT_FIXTURE})));`;
      const result = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: dirname(consumer),
        encoding: 'utf8',
        env: { ...process.env, GLOB_COMPAT_FIXTURE: root },
      });
      expect(JSON.parse(result)).toEqual(['one.txt']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);
