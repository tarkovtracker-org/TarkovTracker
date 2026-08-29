// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mockToggleHidden = vi.fn();
const mockKickTeamMember = vi.fn();
const mockToast = { add: vi.fn() };
const mockMetadataStore = {
  playerLevels: [{ level: 42, levelBadgeImageLink: '/level-42.png' }],
  tasks: [{ id: 'task-1' }, { id: 'task-2' }],
};
const mockPreferencesStore = {
  taskTeamAllHidden: true,
  teamIsHidden: vi.fn(() => true),
  toggleHidden: mockToggleHidden,
};
const mockProgressStore = {
  getDisplayName: vi.fn(() => 'Teammate'),
  getLevel: vi.fn(() => 42),
  tasksCompletions: { 'task-1': { 'user-2': true }, 'task-2': { 'user-2': false } },
};
const mockSystemState = { pvp_team_id: 'team-1' as string | null };
const mockTeamStore = {
  memberProfiles: {} as Record<
    string,
    { displayName?: string; level?: number; tasksCompleted?: number }
  >,
  owner: 'user-1',
};
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user: { id: 'user-1' } } }));
mockNuxtImport('useToast', () => () => mockToast);
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({ kickTeamMember: mockKickTeamMember }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => mockMetadataStore,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => mockProgressStore,
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: { $state: mockSystemState } }),
  };
});
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({
    teamStore: mockTeamStore,
  }),
}));
vi.mock('@/stores/utils/gameMode', () => ({ getCurrentGameMode: () => 'pvp' }));
describe('TeamMemberCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesStore.taskTeamAllHidden = true;
    mockPreferencesStore.teamIsHidden.mockReturnValue(true);
    mockSystemState.pvp_team_id = 'team-1';
    mockTeamStore.memberProfiles = {};
    mockTeamStore.owner = 'user-1';
    mockKickTeamMember.mockResolvedValue({ success: true });
  });
  const mountCard = async (props = { isTeamOwnerView: false, teammember: 'user-2' }) => {
    const { default: TeamMemberCard } = await import('@/features/team/TeamMemberCard.vue');
    return mount(TeamMemberCard, {
      props,
      global: {
        stubs: {
          AppTooltip: { template: '<div><slot /></div>' },
          UBadge: { template: '<span><slot /></span>' },
          UButton: {
            props: ['ariaLabel', 'disabled', 'loading'],
            emits: ['click'],
            template:
              '<button :aria-label="ariaLabel" :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"></button>',
          },
          i18nT: { template: '<div><slot name="completed" /><slot name="total" /></div>' },
        },
        mocks: { $t: (key: string) => key },
      },
    });
  };
  it('disables individual visibility changes while all team tasks are hidden', async () => {
    const wrapper = await mountCard();
    const button = wrapper.get(
      'button[aria-label="page.team.card.manageteam.membercard.enable_team_tasks"]'
    );
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    await button.trigger('click');
    expect(mockToggleHidden).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('toggles visible progress when the global visibility guard is off', async () => {
    mockPreferencesStore.taskTeamAllHidden = false;
    mockPreferencesStore.teamIsHidden.mockReturnValue(false);
    const wrapper = await mountCard();
    const button = wrapper.get(
      'button[aria-label="page.team.card.manageteam.membercard.hide_progress"]'
    );
    await button.trigger('click');
    expect(mockToggleHidden).toHaveBeenCalledWith('user-2');
    wrapper.unmount();
  });
  it('uses member profile data and kicks a teammate successfully', async () => {
    mockPreferencesStore.taskTeamAllHidden = false;
    mockTeamStore.memberProfiles = {
      'user-2': { displayName: 'W'.repeat(25), level: 42, tasksCompleted: 2 },
    };
    const wrapper = await mountCard({ isTeamOwnerView: true, teammember: 'user-2' });
    expect(wrapper.text()).toContain('W'.repeat(25));
    const button = wrapper.get(
      'button[aria-label="page.team.card.manageteam.membercard.remove_member"]'
    );
    await button.trigger('click');
    await vi.waitFor(() => expect(mockKickTeamMember).toHaveBeenCalledWith('team-1', 'user-2'));
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'success',
      title: 'page.team.card.manageteam.membercard.kick_success',
    });
    wrapper.unmount();
  });
  it('shows a local error when the current team is unavailable', async () => {
    mockPreferencesStore.taskTeamAllHidden = false;
    mockSystemState.pvp_team_id = null;
    const wrapper = await mountCard({ isTeamOwnerView: true, teammember: 'user-2' });
    const button = wrapper.get(
      'button[aria-label="page.team.card.manageteam.membercard.remove_member"]'
    );
    await button.trigger('click');
    expect(mockKickTeamMember).not.toHaveBeenCalled();
    expect(mockToast.add).toHaveBeenCalledWith({
      color: 'error',
      description: 'page.team.card.manageteam.membercard.kick_error',
      title: 'page.team.card.manageteam.membercard.kick_error',
    });
    wrapper.unmount();
  });
});
