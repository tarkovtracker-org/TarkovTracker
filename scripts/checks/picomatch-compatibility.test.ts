// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const fromPackage = (parent: NodeJS.Require, specifier: string) =>
  createRequire(parent.resolve(specifier));
const require = createRequire(import.meta.url);
const nuxt = fromPackage(require, 'nuxt/package.json');
const nitroServer = fromPackage(nuxt, '@nuxt/nitro-server/package.json');
const nitro = fromPackage(nitroServer, 'nitropack/package.json');
const unstorage = fromPackage(nitro, 'unstorage');
const globby = fromPackage(nitro, 'globby');
const rollupResolver = fromPackage(nitro, '@rollup/plugin-node-resolve');
const cases = [
  {
    name: 'anymatch',
    parent: unstorage,
    check: () => {
      const anymatch = unstorage('anymatch');
      const matcher = anymatch(['**/*.vue', '!**/*.test.vue']);
      expect(matcher('app/components/Badge.vue')).toBe(true);
      expect(matcher('app/components/Badge.test.vue')).toBe(false);
    },
  },
  {
    name: 'micromatch',
    parent: globby,
    check: () => {
      const micromatch = globby('micromatch');
      const files = ['app/components/Badge.vue', 'app/entry.ts', 'app/entry.test.ts'];
      expect(micromatch(files, ['**/*.{vue,ts}', '!**/*.test.ts'])).toEqual(files.slice(0, 2));
      expect(micromatch.capture('app/components/*.vue', files[0])).toEqual(['Badge']);
    },
  },
  {
    name: '@rollup/pluginutils',
    parent: rollupResolver,
    check: () => {
      const { createFilter } = rollupResolver('@rollup/pluginutils');
      const filter = createFilter('**/*.{vue,ts}', '**/*.test.ts', { resolve: false });
      expect(filter('app/components/Badge.vue')).toBe(true);
      expect(filter('app/entry.test.ts')).toBe(false);
      expect(filter('public/favicon.ico')).toBe(false);
    },
  },
];
describe('picomatch backport in the Nitro dependency graph', () => {
  it.each(cases)('resolves the reviewed package for $name and preserves file matching', (entry) => {
    const consumer = fromPackage(entry.parent, entry.name);
    expect(consumer('picomatch/package.json')).toMatchObject({
      name: '@ryotsu/picomatch',
      version: '4.0.7-a',
    });
    entry.check();
  });
});
