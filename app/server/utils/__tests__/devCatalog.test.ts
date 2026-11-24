import { beforeEach, expect, it, vi } from 'vitest';
import { devCatalog } from '@/server/utils/devCatalog';
const { build, strings } = vi.hoisted(() => ({ build: vi.fn(), strings: vi.fn() }));
vi.mock('@/server/utils/neutralCatalog', () => ({
  buildNeutralCatalog: build,
  buildCatalogStrings: strings,
}));
beforeEach(() => {
  vi.clearAllMocks();
  strings.mockImplementation(async (_lang, refs) => [...refs]);
});
it('rebuilds references after a completed inventory so fresh source keys resolve', async () => {
  build.mockResolvedValue({ data: { name: '@tt:old' } });
  expect(await devCatalog('strings', 'regular', 'en')).toEqual(['@tt:old']);
  build.mockResolvedValue({ data: { name: '@tt:new' } });
  expect(await devCatalog('strings', 'regular', 'de')).toEqual(['@tt:new']);
});
it('shares only the in-flight inventory between concurrent language requests', async () => {
  build.mockResolvedValue({ data: { name: '@tt:current' } });
  await Promise.all([
    devCatalog('strings', 'regular', 'en'),
    devCatalog('strings', 'regular', 'de'),
  ]);
  expect(build).toHaveBeenCalledTimes(30);
});
it('does not retain a failed inventory', async () => {
  build.mockRejectedValueOnce(new Error('Source unavailable'));
  await expect(devCatalog('strings', 'regular', 'en')).rejects.toThrow('Source unavailable');
  build.mockResolvedValue({ data: { name: '@tt:recovered' } });
  expect(await devCatalog('strings', 'regular', 'en')).toEqual(['@tt:recovered']);
});
