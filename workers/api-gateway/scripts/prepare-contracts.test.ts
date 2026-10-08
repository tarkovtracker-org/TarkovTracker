import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareWorkspaceContracts } from './prepare-contracts.mjs';
function fixture() {
  const gateway = mkdtempSync(resolve(tmpdir(), 'tarkov-contract-build-'));
  const contracts = resolve(gateway, 'progress-contracts');
  mkdirSync(resolve(contracts, 'src'), { recursive: true });
  writeFileSync(
    resolve(contracts, 'package.json'),
    JSON.stringify({
      name: '@tarkovtracker/progress-contracts',
      type: 'module',
      exports: { './value': { import: './dist/value.js', types: './dist/value.d.ts' } },
    })
  );
  writeFileSync(
    resolve(contracts, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        declaration: true,
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true,
      },
      include: ['src/*.ts'],
    })
  );
  const source = resolve(contracts, 'src/value.ts');
  writeFileSync(source, 'export const value = 1;\n');
  return { gateway, contracts, source };
}
const consume = (contracts: string) =>
  Number(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'import(process.argv[1]).then(module => console.log(module.value))',
        pathToFileURL(resolve(contracts, 'dist/value.js')).href,
      ],
      { encoding: 'utf8', windowsHide: true }
    )
  );
describe('workspace compiled-contract preparation', () => {
  it('an edited source reaches a compiled consumer without reinstalling', () => {
    const { gateway, contracts, source } = fixture();
    expect(prepareWorkspaceContracts(gateway)).toBe(true);
    expect(consume(contracts)).toBe(1);
    expect(prepareWorkspaceContracts(gateway)).toBe(false);
    writeFileSync(source, 'export const value = 2;\n');
    expect(prepareWorkspaceContracts(gateway)).toBe(true);
    expect(consume(contracts)).toBe(2);
    expect(prepareWorkspaceContracts(gateway)).toBe(false);
  }, 20_000);
  it('repairs an edited compiled output', () => {
    const { gateway, contracts } = fixture();
    prepareWorkspaceContracts(gateway);
    writeFileSync(resolve(contracts, 'dist/value.js'), 'export const value = 99;\n');
    expect(prepareWorkspaceContracts(gateway)).toBe(true);
    expect(consume(contracts)).toBe(1);
  }, 20_000);
  it('rebuilds after an unreadable stamp instead of trusting stale outputs', () => {
    const { gateway, contracts } = fixture();
    prepareWorkspaceContracts(gateway);
    writeFileSync(
      resolve(contracts, 'node_modules/.cache/progress-contracts/build.json'),
      'invalid'
    );
    expect(prepareWorkspaceContracts(gateway)).toBe(true);
  }, 20_000);
  it('leaves a packed installation on its compiled exports', () => {
    expect(prepareWorkspaceContracts(mkdtempSync(resolve(tmpdir(), 'tarkov-packed-build-')))).toBe(
      false
    );
  });
});
