import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import KappaTaskRow from '@/features/kappa/KappaTaskRow.vue';
import type { KappaRowEntry } from '@/features/kappa/useKappaOverview';
const markTaskComplete = vi.fn();
const markTaskUncomplete = vi.fn();
const markTaskAvailable = vi.fn();
vi.mock('@/composables/useTaskActions', () => ({
  useTaskActions: () => ({ markTaskComplete, markTaskUncomplete, markTaskAvailable }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ getLevel: () => 10 }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: unknown, fallback?: string) => {
      if (key === 'common.failed') return key;
      return (typeof paramsOrFallback === 'string' ? paramsOrFallback : fallback) ?? key;
    },
  }),
}));
const row = (status: KappaRowEntry['status']): KappaRowEntry => ({
  task: { id: 'task-1', name: 'Test task', minPlayerLevel: 15 },
  status,
  isInvalid: false,
});
describe('KappaTaskRow', () => {
  it('renders the title-cased failed status from common translations', () => {
    const wrapper = mount(KappaTaskRow, {
      props: { row: row('failed') },
      global: {
        stubs: {
          AppTooltip: {
            props: ['text'],
            template: '<div :data-tooltip="text"><slot /></div>',
          },
          NuxtLink: { template: '<a><slot /></a>' },
          UIcon: true,
        },
      },
    });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Reset failed: Test task');
    expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toContain('common.failed');
  });
});
