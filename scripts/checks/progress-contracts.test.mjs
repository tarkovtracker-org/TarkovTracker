import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProgressContracts, inspectReleasePins } from './progress-contracts.mjs';
const contracts = {
  url: 'https://example.test/v0.1.0/contracts.tgz',
  integrity: 'sha512-reviewed',
};
const manifest = () => ({ dependencies: { '@tarkovtracker/progress-contracts': contracts.url } });
const lock = `resolution: {integrity: ${contracts.integrity}, tarball: ${contracts.url}}`;
describe('published progress contract pins', () => {
  it('rejects a second tracked rule owner even when all release pins agree', () => {
    const root = mkdtempSync(join(tmpdir(), 'contracts-owner-'));
    for (const folder of ['workers/contract-tests', 'workers/api-gateway/progress-contracts'])
      mkdirSync(join(root, folder), { recursive: true });
    for (const file of ['package.json', 'workers/api-gateway/package.json'])
      writeFileSync(join(root, file), JSON.stringify(manifest()));
    writeFileSync(
      join(root, 'workers/contract-tests/api-version.json'),
      JSON.stringify({ contracts })
    );
    writeFileSync(join(root, 'pnpm-lock.yaml'), lock);
    expect(() => checkProgressContracts(root)).toThrow('second source owner');
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
