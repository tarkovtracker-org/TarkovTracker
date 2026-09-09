import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const helper = resolve('scripts/ensure-pnpm.sh');
for (const initial of ['missing', '10.0.0', '11.14.0']) {
  test(`pnpm ${initial}: verify the full manifest pin`, (t) => {
    const cwd = mkdtempSync(join(tmpdir(), 'pnpm-pin-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const pin = `pnpm@11.14.0+sha512.${'a'.repeat(128)}`;
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ packageManager: pin }));
    symlinkSync(process.execPath, join(cwd, 'node'));
    if (initial !== 'missing') writeFileSync(join(cwd, 'version'), initial);
    writeFileSync(
      join(cwd, 'pnpm'),
      '#!/bin/bash\n[[ -f version ]] || exit 127\nread -r version < version || true\necho "$version"\n',
      { mode: 0o755 }
    );
    writeFileSync(
      join(cwd, 'corepack'),
      '#!/bin/bash\necho "$*" >> calls\nif [[ "$1" = prepare ]]; then echo 11.14.0 > version; fi\n',
      { mode: 0o755 }
    );
    const result = spawnSync('/bin/bash', [helper], {
      cwd,
      env: { ...process.env, PATH: cwd },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(join(cwd, 'calls'), 'utf8'),
      `enable pnpm\nprepare ${pin} --activate\n`
    );
  });
}
test('invalid packageManager is rejected before activation', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'pnpm-invalid-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const pin of ['pnpm@latest', 'pnpm@11.14.0', 'pnpm@11.14.0+sha512.abc123']) {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ packageManager: pin }));
    const result = spawnSync('/bin/bash', [helper], { cwd, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must pin an exact pnpm/);
  }
});
