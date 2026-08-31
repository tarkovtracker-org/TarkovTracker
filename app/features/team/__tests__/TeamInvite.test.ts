// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { SystemState } from '@/types/tarkov';
const mockJoinTeam = vi.fn();
const mockToast = { add: vi.fn() };
const mockRoute = reactive({
  query: { code: 'season-one-code', team: 'seasonal-team-1' } as Record<string, string>,
});
const mockSystemState = reactive<SystemState>({
  is_admin: false,
  pve_team_id: null,
  pvp_team_id: null,
  seasonal_team_id: null,
  team: null,
  team_id: null,
  user_id: 'user-1',
});
const mockSystemStore = {
  $state: mockSystemState,
  $patch: vi.fn((patch: Partial<SystemState> | ((state: SystemState) => void)) => {
    if (typeof patch === 'function') {
      patch(mockSystemState);
      return;
    }
    Object.assign(mockSystemState, patch);
  }),
};
mockNuxtImport('useRoute', () => () => mockRoute);
mockNuxtImport('useRouter', () => () => ({
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
}));
mockNuxtImport('useToast', () => () => mockToast);
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({ joinTeam: mockJoinTeam }),
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: mockSystemStore }),
  };
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ getCurrentGameMode: () => 'pvp' }),
}));
const mountInvite = async () => {
  const { default: TeamInvite } = await import('@/features/team/TeamInvite.vue');
  return mount(TeamInvite, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        UAlert: { template: '<div><slot name="title" /></div>' },
        UButton: {
          emits: ['click'],
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
};
describe('TeamInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSystemState.pvp_team_id = null;
    mockSystemState.pve_team_id = null;
    mockSystemState.seasonal_team_id = null;
  });
  it('stores the joined team under the game mode returned by the team service', async () => {
    mockJoinTeam.mockResolvedValue({
      success: true,
      team: { gameMode: 'seasonal', id: 'seasonal-team-1', name: 'Season One' },
    });
    const wrapper = await mountInvite();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(mockJoinTeam).toHaveBeenCalledWith('seasonal-team-1', 'season-one-code');
    expect(mockSystemState.seasonal_team_id).toBe('seasonal-team-1');
    expect(mockSystemState.pvp_team_id).toBeNull();
    expect(mockSystemState.pve_team_id).toBeNull();
    wrapper.unmount();
  });
});
