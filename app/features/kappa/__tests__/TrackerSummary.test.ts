import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrackerSummary from '@/features/kappa/TrackerSummary.vue';
const { markTaskActive, markTaskComplete, markTaskUncomplete } = vi.hoisted(() => ({
  markTaskActive: vi.fn(),
  markTaskComplete: vi.fn(),
  markTaskUncomplete: vi.fn(),
}));
vi.mock('@/composables/useTaskActions', () => ({
  useTaskActions: () => ({
    markTaskActive,
    markTaskComplete,
    markTaskUncomplete,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ getLevel: () => 10 }),
}));
const messages: Record<string, string> = {
  'common.accept': 'Accept',
  'common.available': 'Available',
  'common.failed': 'Failed',
  'common.locked': 'Locked',
  'common.mark_complete': 'Mark complete',
  'common.progress': 'Progress',
  'page.kappa.summary.complete': 'complete',
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
}));
describe('TrackerSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
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
  it('marks an available collector active and labels its next action as Accept', async () => {
    const wrapper = mount(TrackerSummary, {
      props: {
        label: 'Kappa',
        total: 10,
        completed: 4,
        failed: 2,
        available: 3,
        locked: 1,
        accent: 'kappa',
        collector: {
          task: { id: 'collector-task', name: 'Collector' },
          status: 'available',
          isInvalid: false,
        },
      },
      global: { stubs: { UIcon: true, NuxtLink: true } },
    });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Accept: Collector');
    await wrapper.get('button').trigger('click');
    expect(markTaskActive).toHaveBeenCalledOnce();
    expect(markTaskComplete).not.toHaveBeenCalled();
  });
  it('labels an active collector with the action that completes it', async () => {
    const wrapper = mount(TrackerSummary, {
      props: {
        label: 'Kappa',
        total: 10,
        completed: 4,
        failed: 2,
        available: 3,
        locked: 1,
        accent: 'kappa',
        collector: {
          task: { id: 'collector-task', name: 'Collector' },
          status: 'active',
          isInvalid: false,
        },
      },
      global: { stubs: { UIcon: true, NuxtLink: true } },
    });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Mark complete: Collector');
    await wrapper.get('button').trigger('click');
    expect(markTaskComplete).toHaveBeenCalledOnce();
    expect(markTaskActive).not.toHaveBeenCalled();
  });
});
