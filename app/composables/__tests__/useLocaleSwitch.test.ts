// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, reactive, ref } from 'vue';
import { useLocaleSwitch } from '@/composables/useLocaleSwitch';
import { createDeferred } from '@/utils/test-helpers';
const locale = ref('en');
const setLocale = vi.fn(async (code: string) => {
  locale.value = code;
});
let metadata: {
  currentGameMode: string;
  hasCriticalLocaleCache: ReturnType<typeof vi.fn>;
  fetchAllData: ReturnType<typeof vi.fn>;
  updateLanguageAndGameMode: ReturnType<typeof vi.fn>;
};
const preferences = { getLocaleOverride: 'en' as string | null, setLocaleOverride: vi.fn() };
const migrate = vi.fn();
vi.mock('vue-i18n', async (original) => ({
  ...(await original<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale,
    setLocale,
    availableLocales: ['en', 'de', 'fr'],
    t: (key: string, values?: { seconds: number }) => `${key}${values ? ` ${values.seconds}` : ''}`,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadata }));
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => preferences }));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }));
mockNuxtImport('useSkillCalculation', () => () => ({ migrateLegacySkillOffsets: migrate }));
const mounted: ReturnType<typeof mount>[] = [];
const controller = () => {
  let result!: ReturnType<typeof useLocaleSwitch>;
  mounted.push(
    mount(
      defineComponent({
        setup() {
          result = useLocaleSwitch();
          return () => null;
        },
      })
    )
  );
  return result;
};
describe('shared locale switch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    locale.value = 'en';
    vi.clearAllMocks();
    setLocale.mockImplementation(async (code: string) => {
      locale.value = code;
    });
    preferences.getLocaleOverride = 'en';
    preferences.setLocaleOverride.mockImplementation((code) => {
      preferences.getLocaleOverride = code;
    });
    metadata = reactive({
      currentGameMode: 'pvp',
      hasCriticalLocaleCache: vi.fn(async () => false),
      fetchAllData: vi.fn(async () => {}),
      updateLanguageAndGameMode: vi.fn(),
    });
  });
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.useRealTimers();
  });
  it('shares pending and cooldown across mounts, while exempting cached locales', async () => {
    const fetch = createDeferred<undefined>();
    metadata.fetchAllData.mockReturnValueOnce(fetch.promise);
    metadata.hasCriticalLocaleCache.mockImplementation(async (code) => code === 'en');
    const first = controller();
    const second = controller();
    const switching = first.selectLocale('de');
    await flushPromises();
    expect(second.pending.value).toBe(true);
    expect(second.isDisabled('en')).toBe(true);
    fetch.resolve(undefined);
    await switching;
    await flushPromises();
    expect(second.pending.value).toBe(false);
    expect(second.isDisabled('fr')).toBe(true);
    expect(second.isDisabled('en')).toBe(false);
    expect(second.status.value).toContain('10');
    await second.selectLocale('fr');
    expect(metadata.fetchAllData).toHaveBeenCalledTimes(1);
    await second.selectLocale('en');
    expect(locale.value).toBe('en');
    expect(metadata.fetchAllData).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(second.isDisabled('fr')).toBe(false);
  });
  it('disables every mount while cache eligibility is pending and handles its failure', async () => {
    const eligibility = createDeferred<boolean>();
    const first = controller();
    const second = controller();
    await flushPromises();
    metadata.hasCriticalLocaleCache.mockReturnValueOnce(eligibility.promise);
    const switching = first.selectLocale('de');
    expect(second.pending.value).toBe(true);
    expect(second.isDisabled('en')).toBe(true);
    eligibility.reject(new Error('cache unavailable'));
    await switching;
    expect(second.pending.value).toBe(false);
    expect(second.error.value).toBe(true);
    expect(locale.value).toBe('en');
    expect(metadata.fetchAllData).not.toHaveBeenCalled();
  });
  it('aborts a superseded fetch and prevents its late failure rolling back the winner', async () => {
    const oldFetch = createDeferred<undefined>();
    metadata.fetchAllData.mockReturnValueOnce(oldFetch.promise);
    const first = controller();
    const oldSwitch = first.selectLocale('de');
    await flushPromises();
    const oldSignal = metadata.fetchAllData.mock.calls[0]![1].signal as AbortSignal;
    await first.selectLocale('fr');
    expect(oldSignal.aborted).toBe(true);
    oldFetch.reject(new Error('stale'));
    await oldSwitch;
    expect(locale.value).toBe('fr');
    expect(preferences.getLocaleOverride).toBe('fr');
    expect(first.error.value).toBe(false);
    expect(migrate).toHaveBeenCalledTimes(1);
  });
  it('serializes non-abortable i18n work so stale completion cannot overwrite the winner', async () => {
    const oldLocale = createDeferred<undefined>();
    setLocale.mockImplementationOnce(async (code: string) => {
      await oldLocale.promise;
      locale.value = code;
    });
    const first = controller();
    const oldSwitch = first.selectLocale('de');
    await flushPromises();
    const winningSwitch = first.selectLocale('fr');
    await flushPromises();
    oldLocale.resolve(undefined);
    await Promise.all([oldSwitch, winningSwitch]);
    expect(locale.value).toBe('fr');
    expect(metadata.fetchAllData).toHaveBeenCalledTimes(1);
    expect(metadata.updateLanguageAndGameMode).toHaveBeenCalledWith('fr');
  });
  it('restores the original baseline when a superseding switch fails', async () => {
    const oldFetch = createDeferred<undefined>();
    metadata.fetchAllData
      .mockReturnValueOnce(oldFetch.promise)
      .mockRejectedValueOnce(new Error('failed'));
    const first = controller();
    const oldSwitch = first.selectLocale('de');
    await flushPromises();
    await first.selectLocale('fr');
    oldFetch.resolve(undefined);
    await oldSwitch;
    expect(locale.value).toBe('en');
    expect(preferences.getLocaleOverride).toBe('en');
    expect(metadata.updateLanguageAndGameMode).toHaveBeenLastCalledWith('en');
    expect(metadata.fetchAllData).toHaveBeenCalledTimes(3);
    expect(metadata.fetchAllData.mock.calls[2]![1].signal.aborted).toBe(false);
    expect(first.error.value).toBe(true);
    expect(first.pending.value).toBe(false);
  });
  it('reloads original-language metadata when a superseding return to baseline fails', async () => {
    const oldFetch = createDeferred<undefined>();
    let tasks = ['original'];
    metadata.fetchAllData
      .mockReturnValueOnce(oldFetch.promise)
      .mockImplementationOnce(async () => {
        tasks = [];
        throw new Error('failed');
      })
      .mockImplementationOnce(async () => {
        tasks = ['restored'];
      });
    const first = controller();
    const oldSwitch = first.selectLocale('de');
    await flushPromises();
    await first.selectLocale('en');
    oldFetch.resolve(undefined);
    await oldSwitch;
    expect(metadata.fetchAllData).toHaveBeenCalledTimes(3);
    expect(tasks).toEqual(['restored']);
    expect(first.error.value).toBe(true);
  });
  it('shares cache scanning and keeps it alive until the last selector unmounts', async () => {
    controller();
    await flushPromises();
    expect(metadata.hasCriticalLocaleCache).toHaveBeenCalledTimes(3);
    controller();
    await flushPromises();
    expect(metadata.hasCriticalLocaleCache).toHaveBeenCalledTimes(3);
    mounted.shift()!.unmount();
    metadata.hasCriticalLocaleCache.mockClear();
    metadata.currentGameMode = 'pve';
    await flushPromises();
    expect(metadata.hasCriticalLocaleCache).toHaveBeenCalledTimes(3);
    mounted.shift()!.unmount();
    metadata.hasCriticalLocaleCache.mockClear();
    metadata.currentGameMode = 'pvp';
    await flushPromises();
    expect(metadata.hasCriticalLocaleCache).not.toHaveBeenCalled();
    controller();
    await flushPromises();
    expect(metadata.hasCriticalLocaleCache).toHaveBeenCalledTimes(3);
  });
  it('reports an i18n failure and releases pending without fetching metadata', async () => {
    setLocale.mockRejectedValueOnce(new Error('failed'));
    const first = controller();
    await first.selectLocale('de');
    expect(locale.value).toBe('en');
    expect(first.pending.value).toBe(false);
    expect(first.error.value).toBe(true);
    expect(metadata.fetchAllData).not.toHaveBeenCalled();
  });
});
