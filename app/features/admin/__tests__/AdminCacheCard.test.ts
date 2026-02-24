import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import AdminCacheCard from '@/features/admin/AdminCacheCard.vue';
const purgeCacheMock = vi.fn(async () => ({ timestamp: '2026-02-24T00:00:00.000Z' }));
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
  }),
}));
vi.mock('#imports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#imports')>()),
  useNuxtApp: () => ({
    $supabase: {
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      },
      user: supabaseUser,
    },
  }),
  useToast: () => ({
    add: toastAddMock,
  }),
}));
describe('AdminCacheCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemStoreState.isAdmin = true;
    supabaseUser.loggedIn = true;
  });
  it('purges tarkov cache from the action button', async () => {
    const wrapper = mount(AdminCacheCard, {
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
    expect(wrapper.text()).not.toContain('Confirm Full Cache Purge');
    const purgeEverythingButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Purge Everything'));
    expect(purgeEverythingButton).toBeDefined();
    await purgeEverythingButton!.trigger('click');
    expect(wrapper.text()).toContain('Confirm Full Cache Purge');
  });
});
