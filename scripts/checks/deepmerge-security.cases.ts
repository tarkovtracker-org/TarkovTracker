/// <reference types="node" />
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { it } from 'node:test';
import { pathToFileURL } from 'node:url';
// Resolve the actual Nitro build dependency, not an independent test-only copy.
const require = createRequire(import.meta.url);
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'));
const serverRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server/package.json'));
const nitroRequire = createRequire(serverRequire.resolve('nitropack/package.json'));
const resolverPath = nitroRequire.resolve('@rollup/plugin-node-resolve');
const resolverRequire = createRequire(resolverPath);
const merge = resolverRequire('deepmerge');
const payload = () => JSON.parse('{"__proto__":{"tarkovPoisoned":true},"safe":42}');
function assertSafeTree(value: unknown) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(
    Object.getPrototypeOf(value),
    Array.isArray(value) ? Array.prototype : Object.prototype
  );
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(Reflect.get(value, 'tarkovPoisoned'), undefined);
  Object.values(value).forEach(assertSafeTree);
}
const attacks: [string, () => [object, object]][] = [
  ['own target key', () => [payload(), { other: true }]],
  ['null-prototype target', () => [Object.create(null), payload()]],
  ['nested null placeholder', () => [{ nested: null }, { nested: payload() }]],
  ['nested target key', () => [{ nested: payload() }, { other: true }]],
  ['array entry', () => [{}, { list: [payload()] }]],
];
for (const [name, inputs] of attacks) {
  it(`rejects prototype poisoning through ${name}`, () => {
    const [target, source] = inputs();
    const result = merge(target, source);
    assertSafeTree(result);
    assert.match(JSON.stringify(result), /42/);
    assert.equal(Object.hasOwn(Object.prototype, 'tarkovPoisoned'), false);
  });
}
it('preserves defaults, nested merges, ordered arrays and independent copies', () => {
  const shared = { enabled: true };
  const target = {
    mainFields: ['module', 'main'],
    extensions: ['.mjs', '.js'],
    nested: { first: shared, second: shared, retained: true },
  };
  const source = {
    mainFields: ['browser'],
    nested: { first: { extra: true }, empty: null, disabled: false },
  };
  const result = merge(target, source);
  assert.deepEqual(result, {
    mainFields: ['module', 'main', 'browser'],
    extensions: ['.mjs', '.js'],
    nested: {
      first: { enabled: true, extra: true },
      second: { enabled: true },
      retained: true,
      empty: null,
      disabled: false,
    },
  });
  assert.deepEqual(Object.keys(result), ['mainFields', 'extensions', 'nested']);
  assert.deepEqual(target.mainFields, ['module', 'main']);
  assert.notEqual(result.mainFields, target.mainFields);
  assert.notEqual(result.extensions, target.extensions);
  assert.notEqual(result.nested.first, shared);
  assert.notEqual(result.nested.second, shared);
  assert.notEqual(result.nested.first, result.nested.second);
  assert.deepEqual(target.nested.first, { enabled: true });
  assert.deepEqual(source.mainFields, ['browser']);
});
it('preserves merge.all, enumerable symbols and clone:false', () => {
  const key = Symbol('metadata');
  const item = { keep: true };
  assert.deepEqual(merge.all([{ list: [1] }, { list: [2], [key]: item }]), {
    list: [1, 2],
    [key]: { keep: true },
  });
  assert.equal(merge({}, { item }, { clone: false }).item, item);
});
it('loads both actual CommonJS and ESM Rollup resolver entry points', async () => {
  const cjs = nitroRequire('@rollup/plugin-node-resolve');
  const esm = await import(pathToFileURL(resolve(dirname(resolverPath), '../es/index.js')).href);
  assert.equal(cjs.nodeResolve().name, 'node-resolve');
  assert.equal(esm.nodeResolve().name, 'node-resolve');
});
