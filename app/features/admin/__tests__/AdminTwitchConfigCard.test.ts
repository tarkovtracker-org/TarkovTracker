import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import AdminTwitchConfigCard from '@/features/admin/AdminTwitchConfigCard.vue';
const fetchMock = vi.fn();
const toastAddMock = vi.fn();
const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const systemStore = reactive({ isAdmin: true });
vi.stubGlobal('$fetch', fetchMock);
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({ systemStore }),
}));
vi.mock('#imports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#imports')>()),
  useNuxtApp: () => ({
    $supabase: {
      client: {
        auth: {
          getSession: getSessionMock,
          refreshSession: refreshSessionMock,
        },
      },
    },
  }),
  useToast: () => ({ add: toastAddMock }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: { channel?: string }) => params?.channel ?? key,
  }),
}));
const mountCard = () =>
  mount(AdminTwitchConfigCard, {
    global: {
      stubs: {
        GenericCard: { template: '<div><slot name="content" /></div>' },
        UButton: {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        UFormField: { template: '<label><slot /></label>' },
        UIcon: true,
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
describe('AdminTwitchConfigCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemStore.isAdmin = true;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } });
    refreshSessionMock.mockResolvedValue({ data: { session: null } });
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return Promise.resolve({ channel: 'streamer', displayName: 'Streamer', enabled: true });
      }
      return Promise.resolve({ config: {} });
    });
  });
  it('loads the effective Twitch configuration', async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/config', undefined);
    expect(wrapper.findAll('input')[0]!.attributes('value')).toBe('streamer');
    expect(wrapper.findAll('input')[1]!.attributes('value')).toBe('Streamer');
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });
  it('does not save when the current user is not an admin', async () => {
    systemStore.isAdmin = false;
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });
});
