// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskGraphNode from '@/features/tasks/TaskGraphNode.vue';
import type { TaskNodeData } from '@/composables/useTaskGraphData';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
const buildData = (overrides: Partial<TaskNodeData> = {}): TaskNodeData => ({
  taskId: 'task-1',
  taskName: 'Debut',
  traderName: 'Prapor',
  traderId: 'prapor',
  traderImageLink: undefined,
  status: 'available',
  isCrossTrader: false,
  isFocused: false,
  isInFocusChain: false,
  isDimmed: false,
  isRoot: true,
  isLeaf: false,
  minPlayerLevel: 1,
  kappaRequired: false,
  lightkeeperRequired: false,
  ...overrides,
});
const mountNode = (data: TaskNodeData) =>
  mount(TaskGraphNode, {
    props: { data },
    global: {
      stubs: {
        // vue-flow handles are positional SVG anchors; stub them so the node
        // template renders without the flow runtime.
        Handle: { template: '<div />' },
      },
    },
  });
describe('TaskGraphNode light-theme labels', () => {
  it('keeps the flow_start indicator label readable in light mode', () => {
    const wrapper = mountNode(buildData({ isRoot: true }));
    const startLabel = wrapper.find('span[title="page.tasks.graph.flow_start"]');
    expect(startLabel.exists()).toBe(true);
    // text-primary-400/70 resolves to primary-800 at 70% opacity under the light
    // token remap, which lands below AA on the paper canvas; the opaque primary-900
    // companion restores it (parity with the flow_end warning-900 companion).
    expect(startLabel.classes()).toContain('light:text-primary-900');
    wrapper.unmount();
  });
  it('keeps the flow_end indicator label readable in light mode', () => {
    const wrapper = mountNode(buildData({ isLeaf: true }));
    const endLabel = wrapper.find('span[title="page.tasks.graph.flow_end"]');
    expect(endLabel.exists()).toBe(true);
    expect(endLabel.classes()).toContain('light:text-warning-900');
    wrapper.unmount();
  });
  it('does not render indicator labels for interior nodes', () => {
    const wrapper = mountNode(buildData({ isRoot: false, isLeaf: false }));
    expect(wrapper.find('span[title="page.tasks.graph.flow_start"]').exists()).toBe(false);
    expect(wrapper.find('span[title="page.tasks.graph.flow_end"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
