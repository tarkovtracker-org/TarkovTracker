// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mockToggleHidden = vi.fn();
const mockPreferencesStore = {
  taskTeamAllHidden: true,
  teamIsHidden: vi.fn(() => true),
  toggleHidden: mockToggleHidden,
};
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user: { id: 'user-1' } } }));
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/composables/api/useEdgeFunctions', () => ({
  useEdgeFunctions: () => ({ kickTeamMember: vi.fn() }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({ playerLevels: [], tasks: [] }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    getDisplayName: () => 'Teammate',
    getLevel: () => 1,
    tasksCompletions: {},
  }),
}));
vi.mock('@/stores/useSystemStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/useSystemStore')>('@/stores/useSystemStore');
  return {
    ...actual,
    useSystemStoreWithSupabase: () => ({ systemStore: { $state: {} } }),
  };
});
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStoreWithSupabase: () => ({
    teamStore: { memberProfiles: {}, owner: 'user-1' },
  }),
}));
vi.mock('@/stores/utils/gameMode', () => ({ getCurrentGameMode: () => 'pvp' }));
describe('TeamMemberCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesStore.taskTeamAllHidden = true;
  });
  it('disables individual visibility changes while all team tasks are hidden', async () => {
    const { default: TeamMemberCard } = await import('@/features/team/TeamMemberCard.vue');
    const wrapper = mount(TeamMemberCard, {
      props: { isTeamOwnerView: false, teammember: 'user-2' },
      global: {
        stubs: {
          AppTooltip: { template: '<div><slot /></div>' },
          UBadge: true,
          UButton: {
            props: ['ariaLabel', 'disabled'],
            emits: ['click'],
            template:
              '<button :aria-label="ariaLabel" :disabled="disabled" @click="$emit(\'click\')"></button>',
          },
          i18nT: true,
        },
        mocks: { $t: (key: string) => key },
      },
    });
    const button = wrapper.get(
      'button[aria-label="page.team.card.manageteam.membercard.enable_team_tasks"]'
    );
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    await button.trigger('click');
    expect(mockToggleHidden).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
