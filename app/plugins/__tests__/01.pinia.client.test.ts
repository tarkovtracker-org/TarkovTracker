import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const stop = vi.fn();
  return {
    stop,
    configureProgressSession: vi.fn(),
    initializeProgressAuthority: vi.fn(),
    observeProgressAuthority: vi.fn(() => stop),
    recordLocalSave: vi.fn(),
  };
});
vi.mock('@/stores/tarkov/progressAuthority', () => ({
  configureProgressSession: mocks.configureProgressSession,
  initializeProgressAuthority: mocks.initializeProgressAuthority,
  observeProgressAuthority: mocks.observeProgressAuthority,
}));
vi.mock('@/stores/tarkov/progressSaveStatus', () => ({ recordLocalSave: mocks.recordLocalSave }));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }));
const runPlugin = async () => {
  const onUnmount = vi.fn();
  const plugin = (await import('@/plugins/01.pinia.client')).default;
  await plugin.setup?.({
    $supabase: { ready: async () => {}, user: { id: 'user-1' } },
    $pinia: { use: vi.fn() },
    vueApp: { onUnmount },
  } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
  return onUnmount;
};
describe('progress persistence plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('observes other tabs even when the first activation fails, so a later retry stays fresh', async () => {
    mocks.initializeProgressAuthority.mockRejectedValueOnce(new Error('blocked'));
    const onUnmount = await runPlugin();
    expect(mocks.observeProgressAuthority).toHaveBeenCalledOnce();
    expect(onUnmount).toHaveBeenCalledWith(mocks.stop);
    expect(mocks.recordLocalSave).toHaveBeenCalledWith(false, 'unknown');
  });
  it('installs one observer after a successful activation', async () => {
    mocks.initializeProgressAuthority.mockResolvedValueOnce(undefined);
    const onUnmount = await runPlugin();
    expect(mocks.initializeProgressAuthority).toHaveBeenCalledWith('user-1');
    expect(mocks.observeProgressAuthority).toHaveBeenCalledOnce();
    expect(onUnmount).toHaveBeenCalledWith(mocks.stop);
    expect(mocks.recordLocalSave).not.toHaveBeenCalled();
  });
});
