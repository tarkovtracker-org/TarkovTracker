// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AdminSupporterAccessCard from '@/features/admin/AdminSupporterAccessCard.vue';
const { fetchMock, getSessionMock, refreshSessionMock, toastAddMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  toastAddMock: vi.fn(),
}));
const systemStore = reactive({ isAdmin: true });
const supabaseUser = reactive({ id: 'user-1' });
vi.stubGlobal('$fetch', fetchMock);
vi.mock('@/composables/useSupporter', () => ({
  useSupporter: () => ({ fetchStatus: vi.fn() }),
}));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({ systemStore }),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    client: {
      auth: {
        getSession: getSessionMock,
        refreshSession: refreshSessionMock,
      },
    },
    user: supabaseUser,
  },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAddMock }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const mountCard = () =>
  mount(AdminSupporterAccessCard, {
    global: {
      stubs: {
        GenericCard: { template: '<div><slot name="content" /></div>' },
        SelectMenuFixed: { template: '<div />' },
        UButton: {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        UFormField: { template: '<label><slot /></label>' },
        UInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        USwitch: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  });
describe('AdminSupporterAccessCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemStore.isAdmin = true;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } });
    refreshSessionMock.mockResolvedValue({ data: { session: null } });
    fetchMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), {
        data: { code: 'invalid_tier', message: 'Invalid tier' },
      })
    );
  });
  it('maps the server error code to localized copy on failure', async () => {
    const wrapper = mountCard();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'admin.error.invalid_tier' })
    );
  });
});
