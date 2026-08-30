// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, reactive, ref } from 'vue';
import type { SystemState } from '@/types/tarkov';
const mockCopyToClipboard = vi.fn();
const mockTeamUrl = ref('https://tarkovtracker.test/team?team=team-1&code=invite');
const mockSystemState = reactive<SystemState>({
  is_admin: false,
  pve_team_id: null,
  pvp_team_id: 'team-1',
  seasonal_team_id: null,
  team: 'team-1',
  team_id: 'team-1',
  user_id: 'user-1',
});
const mockTeamStore = reactive({ id: 'team-1', members: ['user-1'], owner: 'user-1' });
const mockSystemStore = { $state: mockSystemState };
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: { user: { id: 'user-1' } },
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopyToClipboard }),
}));
vi.mock('@/features/team/useTeamInviteLink', () => ({
  useTeamInviteLink: () => ({ teamUrl: computed(() => mockTeamUrl.value) }),
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: mockSystemStore }),
  };
});
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({ teamStore: mockTeamStore }),
}));
const mountTeamMembers = async () => {
  const { default: TeamMembers } = await import('@/features/team/TeamMembers.vue');
  return mount(TeamMembers, {
    global: {
      stubs: {
        TeamCard: { template: '<div><slot name="icon" /><slot /></div>' },
        TeamMemberCard: { template: '<div data-testid="member-card" />' },
        UButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
      mocks: { $t: (key: string) => key },
    },
  });
};
describe('TeamMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeamStore.members = ['user-1'];
    mockTeamStore.owner = 'user-1';
    mockTeamUrl.value = 'https://tarkovtracker.test/team?team=team-1&code=invite';
    mockCopyToClipboard.mockResolvedValue(true);
  });
  it('shows solo-team guidance and copies the invite link', async () => {
    const wrapper = await mountTeamMembers();
    expect(wrapper.find('[data-testid="team-members-empty-state"]').exists()).toBe(true);
    await wrapper.find('[data-testid="copy-team-members-invite"]').trigger('click');
    await flushPromises();
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      mockTeamUrl.value,
      expect.objectContaining({ revealValue: false, shouldNotify: expect.any(Function) })
    );
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('page.team.members.copied');
    mockCopyToClipboard.mockResolvedValueOnce(false);
    await wrapper.find('[data-testid="copy-team-members-invite"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('page.team.members.copy_invite');
    wrapper.unmount();
  });
});
