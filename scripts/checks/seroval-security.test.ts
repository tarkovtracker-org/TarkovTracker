// @vitest-environment node
/// <reference types="node" />
import { createRequire } from 'node:module';
import { types } from 'node:util';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
// Resolve the serializer used by Nuxt's Vite builder, not a separate test-only dependency.
const require = createRequire(import.meta.url);
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'));
const builderRequire = createRequire(nuxtRequire.resolve('@nuxt/vite-builder/package.json'));
const { serialize, serializeAsync } = builderRequire('seroval');
const poisonedArray = () => {
  const value = new Uint8Array([1, 2]);
  Object.defineProperty(value, 'constructor', {
    value: { name: 'Uint8Array(globalThis.injectionMarker = 1) || Uint8Array' },
  });
  return value;
};
const assertSafeArray = (serialized: string) => {
  const context = { atob, injectionMarker: 0 };
  const decoded = runInNewContext(serialized, context);
  expect(context.injectionMarker).toBe(0);
  expect(types.isUint8Array(decoded)).toBe(true);
  expect(Array.from(decoded)).toEqual([1, 2]);
};
describe('Seroval security patches', () => {
  it('ignores a typed array constructor supplied through untrusted properties', () => {
    for (const options of [{}, { compactArrayBufferViews: true }]) {
      assertSafeArray(serialize(poisonedArray(), options));
    }
  });
  it('also ignores poisoned constructors during asynchronous serialization', async () => {
    assertSafeArray(await serializeAsync(poisonedArray()));
  });
  it('escapes HTML syntax without breaking RegExp sources, flags, or named groups', async () => {
    const expressions = [
      new RegExp('<!--</script><script>sentinel</script>', 'gi'),
      new RegExp('(?<name>a)(?<=a)b', 'g'),
    ];
    for (const expression of expressions) {
      for (const serialized of [serialize(expression), await serializeAsync(expression)]) {
        expect(serialized).not.toContain('<');
        const decoded = runInNewContext(serialized);
        expect(types.isRegExp(decoded)).toBe(true);
        expect(decoded.source).toBe(expression.source);
        expect(decoded.flags).toBe(expression.flags);
      }
    }
  });
});
