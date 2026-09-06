import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const cli = resolve('scripts/lint-i18n.mjs');
for (const target of ['deleted', 'renamed', 'present']) {
  test(`i18n validates supported locale presence: ${target}`, (t) => {
    const cwd = mkdtempSync(join(tmpdir(), 'i18n-presence-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    mkdirSync(join(cwd, 'app/locales'), { recursive: true });
    mkdirSync(join(cwd, 'app/utils'), { recursive: true });
    writeFileSync(
      join(cwd, 'app/utils/locales.ts'),
      "export const SUPPORTED_LOCALES = ['en', 'de'];"
    );
    writeFileSync(join(cwd, 'app/locales/en.json'), JSON.stringify({ hello: 'Hello' }));
    if (target !== 'deleted') {
      const filename = target === 'present' ? 'de.json' : 'fr.json';
      writeFileSync(join(cwd, 'app/locales', filename), '{}');
    }
    const result = spawnSync(process.execPath, [cli], { cwd, encoding: 'utf8' });
    if (target === 'present') {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /missing.*non-fatal/);
    } else {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Missing supported locale file\(s\): de\.json/);
    }
  });
}
