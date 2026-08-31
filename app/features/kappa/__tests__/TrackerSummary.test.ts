import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TrackerSummary from '@/features/kappa/TrackerSummary.vue';
vi.mock('@/composables/useTaskActions', () => ({
  useTaskActions: () => ({
    markTaskActive: vi.fn(),
    markTaskComplete: vi.fn(),
    markTaskUncomplete: vi.fn(),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ getLevel: () => 10 }),
}));
const messages: Record<string, string> = {
  'common.available': 'Available',
  'common.failed': 'Failed',
  'common.locked': 'Locked',
  'common.progress': 'Progress',
  'page.kappa.summary.complete': 'complete',
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
}));
describe('TrackerSummary', () => {
  it('renders common status labels with display casing', () => {
    const wrapper = mount(TrackerSummary, {
      props: {
        label: 'Kappa',
        total: 10,
        completed: 4,
        failed: 2,
        available: 3,
        locked: 1,
        accent: 'kappa',
      },
      global: { stubs: { UIcon: true, NuxtLink: true } },
    });
    expect(wrapper.text()).toContain('Available 3');
    expect(wrapper.text()).toContain('Locked 1');
    expect(wrapper.text()).toContain('Failed 2');
  });
});
