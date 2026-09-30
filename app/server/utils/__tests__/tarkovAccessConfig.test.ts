import { describe, expect, it, vi } from 'vitest';
import { TARKOV_DATA_ACCESS_ACTION } from '@/server/utils/turnstile';
import { TURNSTILE_TEST_SECRET_KEY } from '@/utils/turnstileKeys';
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
interface ConfigOverrides {
  public?: Record<string, unknown>;
  secret?: string;
  hostnames?: string;
}
const buildConfig = (overrides: ConfigOverrides = {}) => ({
  public: {
    appUrl: 'https://tarkovtracker.org',
    tarkovAccessEnabled: true,
    tarkovAccessSiteKey: 'site-key',
    ...(overrides.public ?? {}),
  },
  tarkovAccessExpectedHostnames:
    overrides.hostnames ?? 'TarkovTracker.org , www.tarkovtracker.org ,  ',
  tarkovAccessSecretKey: overrides.secret ?? 'secret-key',
});
const loadModule = async () =>
  (await import('@/server/utils/tarkovAccessConfig')) as typeof import('@/server/utils/tarkovAccessConfig');
describe('resolveTarkovAccessServerConfig', () => {
  it('enables the strict gate for a boolean flag and pins exact hostnames and action', async () => {
    const { resolveTarkovAccessServerConfig } = await loadModule();
    expect(resolveTarkovAccessServerConfig(buildConfig())).toEqual({
      enabled: true,
      expectedAction: TARKOV_DATA_ACCESS_ACTION,
      expectedHostnames: ['tarkovtracker.org', 'www.tarkovtracker.org'],
      flagEnabled: true,
      secretKey: 'secret-key',
      siteKey: 'site-key',
    });
  });
  it("accepts the flag as the client-transport 'true' string", async () => {
    const { resolveTarkovAccessServerConfig } = await loadModule();
    expect(
      resolveTarkovAccessServerConfig(buildConfig({ public: { tarkovAccessEnabled: 'true' } }))
        .flagEnabled
    ).toBe(true);
    expect(
      resolveTarkovAccessServerConfig(buildConfig({ public: { tarkovAccessEnabled: 'TRUE' } }))
        .flagEnabled
    ).toBe(false);
  });
  it('stays disabled when the flag is off even with complete strict keys', async () => {
    const { resolveTarkovAccessServerConfig } = await loadModule();
    const resolved = resolveTarkovAccessServerConfig(
      buildConfig({ public: { tarkovAccessEnabled: false } })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.flagEnabled).toBe(false);
  });
  it('stays disabled when any strict input is missing', async () => {
    const { resolveTarkovAccessServerConfig } = await loadModule();
    expect(resolveTarkovAccessServerConfig(buildConfig({ secret: '' })).enabled).toBe(false);
    expect(
      resolveTarkovAccessServerConfig(buildConfig({ public: { tarkovAccessSiteKey: '' } })).enabled
    ).toBe(false);
    expect(resolveTarkovAccessServerConfig(buildConfig({ hostnames: '  ,  ' })).enabled).toBe(
      false
    );
  });
  it('holds even Cloudflare test widget identifiers to the strict standard', async () => {
    const { resolveTarkovAccessServerConfig } = await loadModule();
    // No identifier exception: the always-pass test secret alone provides no
    // enforceable exact hostname context, so it cannot enable the gate.
    const withoutHostnames = resolveTarkovAccessServerConfig(
      buildConfig({ hostnames: '', secret: TURNSTILE_TEST_SECRET_KEY })
    );
    expect(withoutHostnames.enabled).toBe(false);
    expect(withoutHostnames.expectedAction).toBe(TARKOV_DATA_ACCESS_ACTION);
    // With the full strict context the test identifier resolves like any other pair.
    const withHostnames = resolveTarkovAccessServerConfig(
      buildConfig({ secret: TURNSTILE_TEST_SECRET_KEY })
    );
    expect(withHostnames.enabled).toBe(true);
    expect(withHostnames.expectedHostnames).toEqual(['tarkovtracker.org', 'www.tarkovtracker.org']);
  });
});
describe('toPositiveInteger', () => {
  const fallback = 7;
  const cases: Array<[unknown, number]> = [
    ['5', 5],
    [2, 2],
    [2.9, 2],
    ['', fallback],
    ['abc', fallback],
    [0, fallback],
    [-3, fallback],
    [Infinity, fallback],
    [NaN, fallback],
    [null, fallback],
    [undefined, fallback],
  ];
  it.each(cases)('toPositiveInteger(%p) → %p', async (value, expected) => {
    const { toPositiveInteger } = await loadModule();
    expect(toPositiveInteger(value, fallback)).toBe(expected);
  });
});
