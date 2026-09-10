import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import KappaTaskRow from '@/features/kappa/KappaTaskRow.vue';
import type { KappaRowEntry } from '@/features/kappa/useKappaOverview';
const markTaskComplete = vi.fn();
const markTaskActive = vi.fn();
const markTaskUncomplete = vi.fn();
vi.mock('@/composables/useTaskActions', () => ({
  useTaskActions: () => ({ markTaskActive, markTaskComplete, markTaskUncomplete }),
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
  const mountRow = (status: KappaRowEntry['status']) =>
    mount(KappaTaskRow, {
      props: { row: row(status) },
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
  it('renders the title-cased failed status from common translations', () => {
    const wrapper = mountRow('failed');
    expect(wrapper.get('button').attributes('aria-label')).toBe('Reset failed: Test task');
    expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toContain('common.failed');
  });
  it('accepts an available task before allowing completion', async () => {
    markTaskActive.mockClear();
    markTaskComplete.mockClear();
    const wrapper = mountRow('available');
    expect(wrapper.get('button').attributes('aria-label')).toBe('Accept: Test task');
    await wrapper.get('button').trigger('click');
    expect(markTaskActive).toHaveBeenCalledOnce();
    expect(markTaskComplete).not.toHaveBeenCalled();
  });
  it('completes an active task', async () => {
    markTaskActive.mockClear();
    markTaskComplete.mockClear();
    const wrapper = mountRow('active');
    expect(wrapper.get('button').attributes('aria-label')).toBe('Mark complete: Test task');
    await wrapper.get('button').trigger('click');
    expect(markTaskComplete).toHaveBeenCalledOnce();
    expect(markTaskActive).not.toHaveBeenCalled();
  });
});
