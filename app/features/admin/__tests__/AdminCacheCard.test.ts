// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import AdminCacheCard from '@/features/admin/AdminCacheCard.vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { PurgeCacheResponse } from '@/types/edge';
const purgeCacheMock = vi.fn(
  async (purgeType: PurgeCacheResponse['purgeType']): Promise<PurgeCacheResponse> => ({
    success: true,
    message: 'Cache purged',
    purgeType,
    timestamp: '2026-02-24T00:00:00.000Z',
  })
);
const toastAddMock = vi.fn();
const systemStoreState = reactive({
  isAdmin: true,
  user_id: 'user-1',
});
const supabaseUser = reactive({
  email: 'admin@example.com',
  id: 'user-1',
  loggedIn: true,
});
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({
    purgeCache: purgeCacheMock,
  }),
}));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({
    hasInitiallyLoaded: ref(true),
    systemStore: {
      get isAdmin() {
        return systemStoreState.isAdmin;
      },
      $state: systemStoreState,
    },
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) =>
      (
        ({
          'admin.confirm_full_cache_purge_title': 'Confirm Full Cache Purge',
          'admin.purge_everything_button': 'Purge Everything',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        }),
      }),
    },
    user: supabaseUser,
  },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAddMock }));
const mountCard = () => {
  return mount(AdminCacheCard, {
    global: {
      stubs: {
        GenericCard: {
          template: '<div><slot name="content" /></div>',
        },
        UAlert: true,
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
        UModal: {
          props: ['open'],
          template: '<div v-if="open"><slot name="content" /></div>',
        },
      },
    },
  });
};
describe('AdminCacheCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purgeCacheMock.mockReset();
    systemStoreState.isAdmin = true;
    supabaseUser.loggedIn = true;
  });
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.adminLastPurge);
  });
  it('requires confirmation before purging all cache', async () => {
    const wrapper = mountCard();
    expect(wrapper.text()).not.toContain('Confirm Full Cache Purge');
    const purgeEverythingButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Purge Everything'));
    expect(purgeEverythingButton).toBeDefined();
    await purgeEverythingButton!.trigger('click');
    expect(wrapper.text()).toContain('Confirm Full Cache Purge');
    expect(purgeCacheMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(['tarkov-data', 'all'] as const)(
    'warns when the %s purge audit is missing',
    async (purgeType) => {
      const previousPurge = JSON.stringify({
        type: 'Tarkov data',
        timestamp: '2026-02-23T00:00:00.000Z',
        expiresAt: Date.now() + 60_000,
      });
      localStorage.setItem(STORAGE_KEYS.adminLastPurge, previousPurge);
      purgeCacheMock.mockResolvedValueOnce({
        success: true,
        message: 'Cache purged',
        purgeType,
        timestamp: '2026-02-24T00:00:00.000Z',
        auditWriteFailed: true,
      });
      const wrapper = mountCard();
      await flushPromises();
      expect(wrapper.text()).toContain('admin.last_purge_description');
      const click = (label: string) =>
        wrapper
          .findAll('button')
          .find((button) => button.text() === label)!
          .trigger('click');
      if (purgeType === 'all') await click('Purge Everything');
      await click(
        purgeType === 'all' ? 'admin.confirm_purge_button' : 'admin.purge_game_data_button'
      );
      await flushPromises();
      expect(purgeCacheMock).toHaveBeenCalledExactlyOnceWith(purgeType);
      expect(toastAddMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          title: 'admin.purge_audit_failed_title',
          description: 'admin.purge_audit_failed_description',
          color: 'warning',
        })
      );
      expect(wrapper.text()).toContain('admin.last_purge_description');
      expect(localStorage.getItem(STORAGE_KEYS.adminLastPurge)).toBe(previousPurge);
      wrapper.unmount();
    }
  );
  it.each([
    [{ data: { code: 'cache_purge_failed' } }, 'admin.error.cache_purge_failed'],
    [{ data: { code: 'service_config_missing' } }, 'admin.error.service_config_missing'],
    [{ data: { code: 'admin_privileges_required' } }, 'admin.error.admin_privileges_required'],
    [
      { data: { code: 'unrecognized', error: 'private upstream detail' } },
      'admin.purge_failed_description',
    ],
    [new Error('private upstream detail'), 'admin.purge_failed_description'],
  ])('localizes purge errors and hides unknown upstream messages', async (error, expectedKey) => {
    purgeCacheMock.mockRejectedValueOnce(error);
    const wrapper = mountCard();
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === 'admin.purge_game_data_button');
    await button!.trigger('click');
    await flushPromises();
    expect(purgeCacheMock).toHaveBeenCalledWith('tarkov-data');
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expectedKey,
        color: 'error',
      })
    );
    expect(JSON.stringify(toastAddMock.mock.calls)).not.toContain('private upstream detail');
    wrapper.unmount();
  });
});
