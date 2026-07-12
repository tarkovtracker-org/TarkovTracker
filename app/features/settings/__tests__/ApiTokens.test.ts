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
const runtimeConfig = {
  public: {
    allowDirectTokenCreateFallback: false,
  },
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
    insert: vi.fn((payload: Record<string, unknown>) => {
      mockInsert(payload);
      return table;
    }),
    eq: vi.fn((_column: string, userId: string) => {
      currentUserId = userId;
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
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
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
          props: ['title', 'description'],
          template:
            '<div data-testid="alert"><span>{{ title }}</span><p>{{ description }}</p><slot /></div>',
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
const makeTokenRow = (
  userId: string,
  note: string,
  overrides: Partial<{
    created_at: string;
    game_mode: 'pvp' | 'pve';
    is_active: boolean;
    last_used_at: string | null;
    permissions: string[];
    token_id: string;
    token_value: string | null;
    usage_count: number;
  }> = {}
) => ({
  created_at: '2026-03-10T12:00:00.000Z',
  game_mode: 'pvp' as const,
  is_active: true,
  last_used_at: null,
  note,
  permissions: ['GP'],
  token_id: `${userId}-token`,
  token_value: `${userId}-value`,
  usage_count: 0,
  ...overrides,
});
const resolveLoad = (userId: string, note: string) => {
  pendingLoads.get(userId)?.({
    data: [makeTokenRow(userId, note)],
    error: null,
  });
};
const resolveLoadMany = (userId: string, rows: Array<ReturnType<typeof makeTokenRow>>) => {
  pendingLoads.get(userId)?.({
    data: rows,
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
    runtimeConfig.public.allowDirectTokenCreateFallback = false;
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
  it('shows an error instead of bypassing the function when token creation throws a statusless error', async () => {
    mockCreateToken.mockRejectedValueOnce(new Error('Internal server error'));
    const wrapper = await createWrapper();
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    await flushPromises();
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_success'
      )
    ).toHaveLength(0);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_error'
      )
    ).toHaveLength(1);
    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: 'error.copy_details',
          }),
        ]),
        description: 'Internal server error',
        title: 'page.settings.card.apitokens.create_token_error',
      })
    );
    expect(wrapper.text()).not.toContain('Direct Token');
  });
  it('shows an error instead of direct inserting when token-create is unavailable', async () => {
    mockCreateToken.mockRejectedValueOnce({ status: 404, data: { message: 'Not found' } });
    const wrapper = await createWrapper();
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    await flushPromises();
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_success'
      )
    ).toHaveLength(0);
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_error'
      )
    ).toHaveLength(1);
    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: 'error.copy_details',
          }),
        ]),
        description: 'HTTP 404 · Not found',
        title: 'page.settings.card.apitokens.create_token_error',
      })
    );
    expect(wrapper.text()).not.toContain('Fallback Token');
  });
  it('allows direct insert fallback when explicitly enabled and token-create is unavailable', async () => {
    runtimeConfig.public.allowDirectTokenCreateFallback = true;
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
    expect(wrapper.text()).toContain('Fallback Token');
  });
  it('disables create and shows the token cap alert when the account has 3 active tokens', async () => {
    const wrapper = await createWrapper();
    await flushPromises();
    resolveLoadMany('user-a', [
      makeTokenRow('user-a', 'Token 1', { token_id: 'user-a-token-1' }),
      makeTokenRow('user-a', 'Token 2', { token_id: 'user-a-token-2' }),
      makeTokenRow('user-a', 'Token 3', { token_id: 'user-a-token-3' }),
    ]);
    await flushPromises();
    const createButton = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === 'page.settings.card.apitokens.new_token_expand');
    expect(createButton).toBeTruthy();
    expect(createButton!.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('page.settings.card.apitokens.token_cap_reached');
    expect(wrapper.text()).toContain('page.settings.card.apitokens.token_cap_reached_desc');
  });
  it('shows a warning toast when token-create returns 409 for the active token cap', async () => {
    mockCreateToken.mockRejectedValueOnce({
      status: 409,
      message: 'Token limit reached (3 active)',
    });
    const wrapper = await createWrapper();
    await flushPromises();
    resolveLoad('user-a', 'Existing Token');
    await flushPromises();
    await clickButton(wrapper, 'page.settings.card.apitokens.new_token_expand');
    await clickButton(wrapper, 'page.settings.card.apitokens.submit_new_token');
    await flushPromises();
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'page.settings.card.apitokens.token_cap_reached',
        description: 'page.settings.card.apitokens.token_cap_reached_desc',
        color: 'warning',
      })
    );
    expect(
      mockToast.add.mock.calls.filter(
        ([payload]) => payload.title === 'page.settings.card.apitokens.create_token_error'
      )
    ).toHaveLength(0);
  });
});
