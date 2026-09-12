// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
const mockUserState = {
  loggedIn: true,
  id: 'user-12345678',
  username: 'testuser',
  email: 'test@example.com',
  providers: ['google', 'github', 'discord', 'twitch'] as string[],
};
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: mockUserState,
  },
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
}));
vi.mock('@/stores/useActivityLogStore', () => ({
  useActivityLogStore: () => ({}),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({}),
}));
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStore: () => ({}),
}));
vi.mock('@/stores/useTeamStore', () => ({
  useTeamStore: () => ({}),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({}),
  resetTarkovSync: vi.fn(),
}));
describe('AccountDeletionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const createWrapper = () =>
    mount(AccountDeletionCard, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          GenericCard: {
            template: '<section><slot name="content" /></section>',
          },
          LoginRequiredAlert: { template: '<div data-testid="login-required" />' },
          UTooltip: { template: '<div><slot /></div>' },
          AppTooltip: { template: '<div><slot /></div>' },
          UBadge: {
            inheritAttrs: false,
            props: ['size', 'variant'],
            template: '<span data-testid="provider-badge" :class="$attrs.class"><slot /></span>',
          },
          UButton: {
            template: '<button><slot /></button>',
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-icon="name" />',
          },
          UModal: {
            template: '<div v-if="$attrs.modelValue"><slot /></div>',
          },
          UCard: {
            template: '<div><slot name="header" /><slot /><slot name="footer" /></div>',
          },
          UInput: {
            props: ['modelValue'],
            template: '<input :value="modelValue" />',
          },
        },
      },
    });
  it('renders provider badges with theme-aware classes for all linked providers', () => {
    const wrapper = createWrapper();
    const badges = wrapper.findAll('[data-testid="provider-badge"]');
    expect(badges).toHaveLength(4);
    const googleBadge = badges[0]!;
    const githubBadge = badges[1]!;
    const discordBadge = badges[2]!;
    const twitchBadge = badges[3]!;
    // Google badge
    expect(googleBadge.classes()).toContain('light:text-black');
    // Github badge
    expect(githubBadge.classes()).toContain('text-white');
    // Discord badge
    expect(discordBadge.classes()).toContain('text-white');
    // Twitch badge
    expect(twitchBadge.classes()).toContain('text-white');
  });
});
