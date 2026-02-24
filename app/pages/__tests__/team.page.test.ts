// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamPage from '@/pages/team.vue';
const hasTeamMock = vi.fn(() => true);
const routeQuery = { code: undefined as string | undefined, team: undefined as string | undefined };
mockNuxtImport('definePageMeta', () => () => {});
mockNuxtImport('useSeoMeta', () => () => {});
mockNuxtImport('useRoute', () => () => ({
  meta: { titleKey: 'page.team.meta.title' },
  query: routeQuery,
}));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: () => ({
    hasTeam: hasTeamMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
describe('team page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeQuery.team = undefined;
    routeQuery.code = undefined;
    hasTeamMock.mockReturnValue(true);
  });
  it('renders team members when user has a team', async () => {
    const wrapper = mount(TeamPage, {
      global: {
        stubs: {
          MyTeam: { template: '<div data-testid="my-team" />' },
          TeamInvite: { template: '<div data-testid="team-invite" />' },
          TeamMembers: { template: '<div data-testid="team-members" />' },
          TeamOptions: { template: '<div data-testid="team-options" />' },
        },
      },
    });
    expect(wrapper.find('[data-testid="team-members"]').exists()).toBe(true);
  });
  it('renders invite card when invite query params exist', async () => {
    routeQuery.team = 'abc';
    routeQuery.code = '123';
    hasTeamMock.mockReturnValue(false);
    const wrapper = mount(TeamPage, {
      global: {
        stubs: {
          MyTeam: { template: '<div data-testid="my-team" />' },
          TeamInvite: { template: '<div data-testid="team-invite" />' },
          TeamMembers: { template: '<div data-testid="team-members" />' },
          TeamOptions: { template: '<div data-testid="team-options" />' },
        },
      },
    });
    expect(wrapper.find('[data-testid="team-invite"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="team-members"]').exists()).toBe(false);
  });
});
