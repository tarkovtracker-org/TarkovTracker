// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
const { mockCreateToken, mockRevokeToken } = vi.hoisted(() => ({
  mockCreateToken: vi.fn(),
  mockRevokeToken: vi.fn(),
}));
const mockSupabaseUser = reactive({
  loggedIn: true,
  id: 'user-a',
});
const mockToast = {
  add: vi.fn(),
};
const pendingLoads = new Map<
  string,
  (value: {
    data: Array<{
      created_at: string;
      game_mode: 'pvp' | 'pve';
      is_active: boolean;
      last_used_at: string | null;
      note: string;
      permissions: string[];
      token_id: string;
      token_value: string | null;
      usage_count: number;
    }>;
    error: null;
  }) => void
>();
const pendingCreates = new Map<
  string,
  (value: { tokenId?: string; tokenValue?: string }) => void
>();
const mockInsert = vi.fn();
const mockInsertSingle = vi.fn();
const mockFrom = vi.fn(() => {
  let currentUserId = '';
  const table = {
    delete: vi.fn(() => table),
    eq: vi.fn((_column: string, userId: string) => {
      currentUserId = userId;
      return table;
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      mockInsert(payload);
      return table;
    }),
    order: vi.fn(
      () =>
        new Promise((resolve) => {
          pendingLoads.set(currentUserId, resolve);
        })
    ),
    select: vi.fn(() => table),
    single: vi.fn(() => mockInsertSingle()),
  };
  return table;
});
const mockSupabaseClient = {
  from: mockFrom,
};
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: mockSupabaseUser,
    client: mockSupabaseClient,
  },
}));
mockNuxtImport('useToast', () => () => mockToast);
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({
    createToken: mockCreateToken,
    revokeToken: mockRevokeToken,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
const createWrapper = async () => {
  const { default: ApiTokens } = await import('@/features/settings/ApiTokens.vue');
  return mount(ApiTokens, {
    global: {
      stubs: {
        UAlert: {
          template: '<div><slot /></div>',
        },
        UBadge: {
          template: '<span><slot /></span>',
        },
        UButton: {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template:
            '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
        },
        UCard: {
          template: '<div><slot /></div>',
        },
        UCheckbox: {
          props: ['modelValue'],
          emits: ['update:model-value'],
          template:
            '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:model-value\', $event.target.checked)" />',
        },
        UFormField: {
          template: '<div><slot /></div>',
        },
        UIcon: true,
        UInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        UModal: {
          props: ['open'],
          emits: ['update:open'],
          template:
            '<div v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" :close="() => $emit(\'update:open\', false)" /></div>',
        },
        URadioGroup: {
          props: ['items', 'modelValue', 'valueKey'],
          emits: ['update:modelValue'],
          template:
            '<div><input v-for="item in items" :key="item[valueKey || \'value\']" type="radio" :checked="modelValue === item[valueKey || \'value\']" @change="$emit(\'update:modelValue\', item[valueKey || \'value\'])" /></div>',
        },
        UTooltip: {
          template: '<div><slot /></div>',
        },
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
};
const resolveLoad = (userId: string, note: string) => {
  pendingLoads.get(userId)?.({
    data: [
      {
        created_at: '2026-03-10T12:00:00.000Z',
        game_mode: 'pvp',
        is_active: true,
        last_used_at: null,
        note,
        permissions: ['GP'],
        token_id: `${userId}-token`,
        token_value: `${userId}-value`,
        usage_count: 0,
      },
    ],
    error: null,
  });
};
const resolveCreate = (userId: string, tokenValue: string) => {
  pendingCreates.get(userId)?.({
    tokenId: `${userId}-created-token`,
    tokenValue,
  });
  pendingCreates.delete(userId);
};
const clickButton = async (wrapper: Awaited<ReturnType<typeof createWrapper>>, label: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label);
  expect(button).toBeTruthy();
  await button!.trigger('click');
};
describe('ApiTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
    pendingLoads.clear();
    pendingCreates.clear();
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-a';
    mockCreateToken.mockReset();
    mockInsert.mockReset();
    mockInsertSingle.mockReset();
    mockCreateToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingCreates.set(mockSupabaseUser.id, resolve);
        })
    );
    mockRevokeToken.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('ignores stale token loads after an account switch', async () => {
    const wrapper = await createWrapper();
    await flushPromises();
    expect(pendingLoads.has('user-a')).toBe(true);
    mockSupabaseUser.id = 'user-b';
    await flushPromises();
    expect(pendingLoads.has('user-b')).toBe(true);
    resolveLoad('user-b', 'Token B');
    await flushPromises();
    expect(wrapper.text()).toContain('Token B');
    expect(wrapper.text()).not.toContain('Token A');
    resolveLoad('user-a', 'Token A');
    await flushPromises();
    expect(wrapper.text()).toContain('Token B');
    expect(wrapper.text()).not.toContain('Token A');
  });
  it('ignores stale token creates after an account switch', async () => {
    const wrapper = await createWrapper();
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    expect(pendingCreates.has('user-a')).toBe(true);
    mockSupabaseUser.id = 'user-b';
    await flushPromises();
    expect(pendingLoads.has('user-b')).toBe(true);
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    expect(pendingCreates.has('user-b')).toBe(true);
    resolveCreate('user-b', 'user-b-created-value');
    await flushPromises();
    resolveLoad('user-b', 'Token B');
    await flushPromises();
    const successTitles = mockToast.add.mock.calls
      .map(([payload]) => payload.title)
      .filter((title) => title === 'page.settings.card.apitokens.create_token_success');
    expect(successTitles).toHaveLength(1);
    expect(wrapper.text()).toContain('Token B');
    expect(wrapper.text()).not.toContain('Token A');
    expect(
      wrapper
        .findAll('input')
        .some((input) => (input.element as HTMLInputElement).value === 'user-b-created-value')
    ).toBe(true);
    resolveCreate('user-a', 'user-a-created-value');
    await flushPromises();
    expect(
      wrapper
        .findAll('input')
        .some((input) => (input.element as HTMLInputElement).value === 'user-b-created-value')
    ).toBe(true);
    expect(
      wrapper
        .findAll('input')
        .some((input) => (input.element as HTMLInputElement).value === 'user-a-created-value')
    ).toBe(false);
    expect(wrapper.text()).toContain('Token B');
    expect(wrapper.text()).not.toContain('Token A');
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_success'
      )
    ).toHaveLength(1);
  });
  it('falls back to direct insert when the gateway throws a statusless error', async () => {
    mockCreateToken.mockRejectedValueOnce(new Error('Internal server error'));
    mockInsertSingle.mockResolvedValueOnce({
      data: { token_id: 'user-a-direct-token' },
      error: null,
    });
    const wrapper = await createWrapper();
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    await flushPromises();
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0]?.[0]).toMatchObject({
      game_mode: 'pvp',
      note: null,
      permissions: ['GP'],
      user_id: 'user-a',
    });
    resolveLoad('user-a', 'Direct Token');
    await flushPromises();
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_success'
      )
    ).toHaveLength(1);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_error'
      )
    ).toHaveLength(0);
    expect(wrapper.text()).toContain('Direct Token');
  });
  it('falls back to direct insert when token-create is unavailable', async () => {
    mockCreateToken.mockRejectedValueOnce({ status: 404, data: { message: 'Not found' } });
    mockInsertSingle.mockResolvedValueOnce({
      data: { token_id: 'user-a-direct-token' },
      error: null,
    });
    const wrapper = await createWrapper();
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    await flushPromises();
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    resolveLoad('user-a', 'Fallback Token');
    await flushPromises();
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_success'
      )
    ).toHaveLength(1);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_error'
      )
    ).toHaveLength(0);
    expect(wrapper.text()).toContain('Fallback Token');
  });
});
