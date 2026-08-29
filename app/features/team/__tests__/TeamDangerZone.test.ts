// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { SystemState } from '@/types/tarkov';
const mockSupabaseUser = { id: 'user-1' };
const mockToast = { add: vi.fn() };
const mockDisbandTeam = vi.fn();
const mockLeaveTeam = vi.fn();
const mockTarkovStore = { getCurrentGameMode: vi.fn(() => 'pvp') };
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
    } else {
      Object.assign(mockSystemState, patch);
    }
  }),
};
const mockTeamStore = {
  owner: null as string | null,
  $reset: vi.fn(() => {
    mockTeamStore.owner = null;
  }),
};
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: { user: mockSupabaseUser },
}));
mockNuxtImport('useToast', () => () => mockToast);
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({ disbandTeam: mockDisbandTeam, leaveTeam: mockLeaveTeam }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => mockTarkovStore,
}));
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({ teamStore: mockTeamStore }),
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: mockSystemStore }),
  };
});
const UButtonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
};
const UModalStub = {
  props: ['open'],
  emits: ['update:open'],
  template:
    '<div v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" /></div>',
};
const mountDangerZone = async () => {
  const { default: TeamDangerZone } = await import('@/features/team/TeamDangerZone.vue');
  return mount(TeamDangerZone, {
    global: {
      stubs: { UButton: UButtonStub, UIcon: true, UModal: UModalStub },
      mocks: { $t: (key: string) => key },
    },
  });
};
describe('TeamDangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSystemState.pvp_team_id = 'team-1';
    mockSystemState.team = 'team-1';
    mockSystemState.team_id = 'team-1';
    mockTeamStore.owner = 'user-1';
    mockDisbandTeam.mockResolvedValue({ success: true });
    mockLeaveTeam.mockResolvedValue({ success: true });
  });
  it('requires confirmation before disbanding and clears local state afterward', async () => {
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    expect(mockDisbandTeam).not.toHaveBeenCalled();
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockDisbandTeam).toHaveBeenCalledWith('team-1');
    expect(mockLeaveTeam).not.toHaveBeenCalled();
    expect(mockSystemState.pvp_team_id).toBeNull();
    expect(mockTeamStore.$reset).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('uses the regular leave operation for non-owners', async () => {
    mockTeamStore.owner = 'other-user';
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockLeaveTeam).toHaveBeenCalledWith('team-1');
    expect(mockDisbandTeam).not.toHaveBeenCalled();
    expect(mockSystemState.pvp_team_id).toBeNull();
    wrapper.unmount();
  });
});
