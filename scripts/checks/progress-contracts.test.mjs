import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkProgressContracts,
  compareCompiledContracts,
  inspectReleasePins,
} from './progress-contracts.mjs';
const contracts = {
  url: 'https://example.test/v0.1.0/contracts.tgz',
  integrity: 'sha512-reviewed',
};
const manifest = () => ({ dependencies: { '@tarkovtracker/progress-contracts': contracts.url } });
const lock = `resolution: {integrity: ${contracts.integrity}, tarball: ${contracts.url}}`;
function withOwnerFixture(check) {
  const root = mkdtempSync(join(tmpdir(), 'contracts-owner-'));
  try {
    mkdirSync(join(root, 'workers/contract-tests'), { recursive: true });
    mkdirSync(join(root, 'workers/api-gateway'), { recursive: true });
    for (const file of ['package.json', 'workers/api-gateway/package.json'])
      writeFileSync(join(root, file), JSON.stringify(manifest()));
    writeFileSync(
      join(root, 'workers/contract-tests/api-version.json'),
      JSON.stringify({ contracts })
    );
    writeFileSync(join(root, 'pnpm-lock.yaml'), lock);
    check(root, join(root, 'workers/api-gateway/progress-contracts'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
describe('published progress contract pins', () => {
  it.each([
    ['package.json', (owner) => writeFileSync(join(owner, 'package.json'), '{}')],
    ['src', (owner) => mkdirSync(join(owner, 'src'))],
  ])('rejects a second rule owner with %s even when all release pins agree', (_, add) => {
    withOwnerFixture((root, owner) => {
      mkdirSync(owner);
      add(owner);
      expect(() => checkProgressContracts(root)).toThrow('second source owner');
    });
  });
  it('ignores build leftovers from the removed workspace package', () => {
    withOwnerFixture((root, owner) => {
      for (const folder of ['dist', 'node_modules'])
        mkdirSync(join(owner, folder), { recursive: true });
      expect(checkProgressContracts(root)).toEqual({ contracts });
    });
  });
  it('accepts the same release in both consumers and the lockfile', () => {
    expect(inspectReleasePins({ contracts }, manifest(), manifest(), lock)).toEqual([]);
  });
  it.each(['frontend', 'gateway'])('rejects an independently drifting %s dependency', (owner) => {
    const changed = manifest();
    changed.dependencies['@tarkovtracker/progress-contracts'] = 'workspace:*';
    const consumers = owner === 'frontend' ? [changed, manifest()] : [manifest(), changed];
    expect(inspectReleasePins({ contracts }, ...consumers, lock)).toHaveLength(1);
  });
  it.each(['sha512-reviewed', 'https://example.test/v0.1.0/contracts.tgz'])(
    'rejects a changed lockfile digest or URL: %s',
    (field) => {
      expect(
        inspectReleasePins({ contracts }, manifest(), manifest(), lock.replace(field, 'changed'))
      ).toHaveLength(1);
    }
  );
});
function withCompiledFixture(check) {
  const root = mkdtempSync(join(tmpdir(), 'contracts-parity-'));
  const owners = { installed: join(root, 'installed'), api: join(root, 'api') };
  try {
    for (const owner of Object.values(owners)) {
      mkdirSync(join(owner, 'dist'), { recursive: true });
      mkdirSync(join(owner, 'fixtures'));
      writeFileSync(join(owner, 'dist/rule.js'), 'export const rule = 1;');
      writeFileSync(join(owner, 'fixtures/task-failure-branches.json'), '{}');
    }
    check(owners);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
describe('compiled API release parity', () => {
  it('compares the same compiled files and fixture bytes', () => {
    withCompiledFixture(({ installed, api }) => {
      expect(compareCompiledContracts(installed, api)).toEqual([
        'dist/rule.js',
        'fixtures/task-failure-branches.json',
      ]);
    });
  });
  it.each(['installed', 'api'])('rejects an extra compiled file in %s', (owner) => {
    withCompiledFixture((owners) => {
      writeFileSync(join(owners[owner], 'dist/newRule.js'), 'export const newRule = 1;');
      expect(() => compareCompiledContracts(owners.installed, owners.api)).toThrow(
        'compiled file sets differ'
      );
    });
  });
  it('rejects changed bytes even when compiled file inventories agree', () => {
    withCompiledFixture(({ installed, api }) => {
      writeFileSync(join(api, 'dist/rule.js'), 'export const rule = 2;');
      expect(() => compareCompiledContracts(installed, api)).toThrow('contracts differ');
    });
  });
});
