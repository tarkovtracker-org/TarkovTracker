import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireLock, releaseLock } from './codex-review-lock.mjs';
const moduleUrl = new URL('./codex-review-lock.mjs', import.meta.url).href;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'codex-lock-'));
  return { root, path: join(root, 'request.lock') };
}
function deadLock(path) {
  // The child exits without releasing its lock, leaving a known terminated owner.
  execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import { acquireLock } from ${JSON.stringify(moduleUrl)}; acquireLock(process.argv[1]);`,
    path,
  ]);
}
function contend(path) {
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { acquireLock, releaseLock } from ${JSON.stringify(moduleUrl)};
     const token = acquireLock(process.argv[1]);
     process.stdout.write(JSON.stringify(Boolean(token)) + '\\n');
     if (token) process.stdin.once('data', () => {
       releaseLock(process.argv[1], token);
       process.exit(0);
     });`,
    path,
  ]);
  const exited = new Promise((resolve) => child.once('close', resolve));
  const acquired = new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) resolve(JSON.parse(output));
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!output.includes('\n'))
        reject(new Error(`Lock contender exited ${code} without a result`));
    });
  });
  return { child, acquired, exited };
}
test('live owners and invalid or missing metadata are preserved', () => {
  const { root, path } = fixture();
  try {
    const token = acquireLock(path);
    assert.ok(token);
    assert.equal(acquireLock(path), null);
    releaseLock(path, 'different-token');
    assert.equal(existsSync(path), true);
    releaseLock(path, token);
    mkdirSync(path);
    assert.equal(acquireLock(path), null);
    writeFileSync(join(path, 'owner.json'), '{broken');
    assert.equal(acquireLock(path), null);
    writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: -1, host: hostname(), token }));
    assert.equal(acquireLock(path), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('a terminated local owner is recovered without removing any request intent', () => {
  const { root, path } = fixture();
  const intent = join(root, 'intent.json');
  try {
    writeFileSync(intent, '{"sha":"retained"}');
    deadLock(path);
    const old = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
    const token = acquireLock(path);
    assert.ok(token);
    assert.notEqual(token, old.token);
    assert.equal(JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')).pid, process.pid);
    assert.equal(readFileSync(intent, 'utf8'), '{"sha":"retained"}');
    releaseLock(path, token);
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('cross-host owners and interrupted recovery preserve uncertain state', () => {
  const { root, path } = fixture();
  try {
    deadLock(path);
    const ownerPath = join(path, 'owner.json');
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    writeFileSync(ownerPath, JSON.stringify({ ...owner, host: `${hostname()}-other` }));
    assert.equal(acquireLock(path), null);
    writeFileSync(ownerPath, JSON.stringify(owner));
    mkdirSync(`${path}.recovery`);
    assert.equal(acquireLock(path), null);
    assert.equal(readFileSync(ownerPath, 'utf8'), JSON.stringify(owner));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('concurrent dead-owner recovery admits only one live lock holder', async () => {
  const { root, path } = fixture();
  const contenders = [];
  try {
    deadLock(path);
    contenders.push(contend(path), contend(path));
    const outcomes = await Promise.all(contenders.map((item) => item.acquired));
    assert.equal(outcomes.filter(Boolean).length, 1);
    outcomes.forEach((held, index) => {
      if (held) contenders[index].child.stdin.end('release\n');
    });
    const codes = await Promise.all(contenders.map((item) => item.exited));
    assert.deepEqual(codes, [0, 0]);
    assert.equal(existsSync(path), false);
  } finally {
    contenders.forEach((item) => item.child.kill());
    await Promise.all(contenders.map((item) => item.exited));
    rmSync(root, { recursive: true, force: true });
  }
});
test('a failed owner metadata write removes only the newly created lock', (t) => {
  const { root, path } = fixture();
  const failure = new Error('simulated metadata write failure');
  try {
    t.mock.method(fs, 'writeFileSync', () => {
      throw failure;
    });
    syncBuiltinESMExports();
    assert.throws(
      () => acquireLock(path),
      (error) => error === failure
    );
    assert.equal(existsSync(path), false);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  }
});
