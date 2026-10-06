import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ActivityLogPanel from '@/shell/ActivityLogPanel.vue';
const entries = [
  {
    id: 'partial',
    timestamp: 1_000,
    source: 'api',
    type: 'system',
    action: 'sync',
    title: 'activity_log.api_synced',
    metadata: {
      id: 'partial',
      at: 1_000,
      source: 'api',
      taskCount: 30,
      tasks: [{ id: 'task-a', state: 'completed' }],
    },
  },
];
vi.mock('@/stores/useActivityLogStore', () => ({
  useActivityLogStore: () => ({ allEntries: entries, hasUnread: false }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({ getTaskById: () => undefined }),
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: Record<string, unknown> | string) =>
    typeof params === 'object' ? `${key}:${JSON.stringify(params)}` : key,
  locale: { value: 'en' },
}));
describe('ActivityLogPanel', () => {
  it('does not offer a Clear control that leaves API history visible', () => {
    const wrapper = mount(ActivityLogPanel, {
      global: {
        stubs: {
          UButton: { template: '<button><slot /></button>' },
          UIcon: true,
          UBadge: true,
        },
      },
    });
    expect(wrapper.text()).toContain('activity_log.api_synced');
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain(
      'activity_log.clear'
    );
  });
  it('counts every API task update not shown in the entry preview', () => {
    const wrapper = mount(ActivityLogPanel, {
      global: { stubs: { UButton: true, UIcon: true, UBadge: true } },
    });
    expect(wrapper.text()).toContain('activity_log.more_count:{"count":29}');
  });
});
