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
  id: null as string | null,
  owner: null as string | null,
  $reset: vi.fn(() => {
    mockTeamStore.id = null;
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
    mockSystemState.pve_team_id = null;
    mockSystemState.seasonal_team_id = null;
    mockSystemState.team = 'team-1';
    mockSystemState.team_id = 'team-1';
    mockTeamStore.id = 'team-1';
    mockTeamStore.owner = 'user-1';
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pvp');
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
    expect(wrapper.text()).toContain('page.team.danger_zone.confirm_leave_title');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockLeaveTeam).toHaveBeenCalledWith('team-1');
    expect(mockDisbandTeam).not.toHaveBeenCalled();
    expect(mockSystemState.pvp_team_id).toBeNull();
    wrapper.unmount();
  });
  it('does not expose a membership action until the team owner is resolved', async () => {
    mockTeamStore.owner = null;
    const wrapper = await mountDangerZone();
    expect(wrapper.find('[data-testid="team-danger-zone"]').exists()).toBe(false);
    expect(mockDisbandTeam).not.toHaveBeenCalled();
    expect(mockLeaveTeam).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('keeps the confirmation and local state when disbanding fails', async () => {
    mockDisbandTeam.mockRejectedValue(new Error('Network unavailable'));
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockToast.add).toHaveBeenCalledWith({ color: 'error', title: 'Network unavailable' });
    expect(wrapper.find('[data-testid="confirm-team-danger-action"]').exists()).toBe(true);
    expect(mockSystemState.pvp_team_id).toBe('team-1');
    expect(mockTeamStore.$reset).not.toHaveBeenCalled();
    const confirmButton = wrapper.find('[data-testid="confirm-team-danger-action"]');
    expect((confirmButton.element as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });
  it('shows the translated error when a membership operation returns failure', async () => {
    mockDisbandTeam.mockResolvedValue({ success: false });
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'error',
      title: 'page.team.danger_zone.disband_error',
    });
    expect(wrapper.find('[data-testid="confirm-team-danger-action"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('shows a generic error when a membership action rejects with a non-error value', async () => {
    mockDisbandTeam.mockRejectedValue('request failed');
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'error',
      title: 'page.team.danger_zone.action_error',
    });
    wrapper.unmount();
  });
  it('does not clear a replacement team when the membership action resolves late', async () => {
    let resolveLeave!: (value: { success: boolean }) => void;
    mockTeamStore.owner = 'other-user';
    mockLeaveTeam.mockReturnValueOnce(
      new Promise<{ success: boolean }>((resolve) => {
        resolveLeave = resolve;
      })
    );
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    const actionPromise = wrapper
      .find('[data-testid="confirm-team-danger-action"]')
      .trigger('click');
    await vi.waitFor(() => expect(mockLeaveTeam).toHaveBeenCalledWith('team-1'));
    mockSystemState.pvp_team_id = 'replacement-team';
    mockSystemState.team = 'replacement-team';
    mockSystemState.team_id = 'replacement-team';
    mockTeamStore.id = 'replacement-team';
    mockTeamStore.owner = 'user-1';
    resolveLeave({ success: true });
    await actionPromise;
    await flushPromises();
    expect(mockSystemState.pvp_team_id).toBe('replacement-team');
    expect(mockSystemState.team).toBe('replacement-team');
    expect(mockSystemState.team_id).toBe('replacement-team');
    expect(mockTeamStore.id).toBe('replacement-team');
    expect(mockTeamStore.$reset).not.toHaveBeenCalled();
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'success',
      title: 'page.team.card.myteam.leave_team_success',
    });
    wrapper.unmount();
  });
  it('clears persistent legacy aliases without disturbing another mode team', async () => {
    mockTarkovStore.getCurrentGameMode.mockReturnValue('pve');
    mockSystemState.pvp_team_id = 'pvp-team';
    mockSystemState.pve_team_id = 'pve-team';
    mockSystemState.team = 'pvp-team';
    mockSystemState.team_id = 'pvp-team';
    mockTeamStore.id = 'pve-team';
    mockTeamStore.owner = 'other-user';
    const wrapper = await mountDangerZone();
    await wrapper.find('[data-testid="open-team-danger-confirmation"]').trigger('click');
    await wrapper.find('[data-testid="confirm-team-danger-action"]').trigger('click');
    await flushPromises();
    expect(mockLeaveTeam).toHaveBeenCalledWith('pve-team');
    expect(mockSystemState.pve_team_id).toBeNull();
    expect(mockSystemState.pvp_team_id).toBe('pvp-team');
    expect(mockSystemState.team).toBe('pvp-team');
    expect(mockSystemState.team_id).toBe('pvp-team');
    wrapper.unmount();
  });
});
