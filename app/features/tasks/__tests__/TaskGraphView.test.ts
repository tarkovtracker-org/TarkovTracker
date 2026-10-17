// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import TaskGraphView from '@/features/tasks/TaskGraphView.vue';
import type { TaskNodeData } from '@/composables/useTaskGraphData';
mockNuxtImport('useSharedBreakpoints', () => () => ({ lgAndUp: ref(true) }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
mockNuxtImport('useRouter', () => () => ({ push: vi.fn() }));
vi.mock('pinia', () => ({
  storeToRefs: (store: { getTaskTraderView: unknown }) => ({
    getTaskTraderView: store.getTaskTraderView,
  }),
}));
vi.mock('@/stores/usePreferences', async () => {
  const { ref } = await import('vue');
  return {
    usePreferencesStore: () => ({
      getTaskTraderView: ref('trader-1'),
      setTaskPrimaryView: vi.fn(),
    }),
  };
});
vi.mock('@/composables/useMapResize', async () => {
  const { ref } = await import('vue');
  return {
    useMapResize: () => ({
      isResizing: ref(false),
      mapHeight: ref(620),
      mapHeightMax: ref(900),
      mapHeightMin: ref(360),
      onResizeKeydown: vi.fn(),
      resizeHandleRef: ref(null),
      startResize: vi.fn(),
    }),
  };
});
vi.mock('@/composables/useTaskGraphData', async () => {
  const { ref } = await import('vue');
  const data: TaskNodeData = {
    taskId: 'active-task',
    taskName: 'Active task',
    traderName: 'Prapor',
    traderId: 'trader-1',
    traderImageLink: undefined,
    status: 'active',
    isCrossTrader: false,
    isFocused: false,
    isInFocusChain: true,
    isDimmed: false,
    isRoot: true,
    isLeaf: true,
    minPlayerLevel: 1,
    kappaRequired: false,
    lightkeeperRequired: false,
  };
  return {
    useTaskGraphData: () => ({
      nodes: ref([{ id: 'active-task', type: 'taskNode', position: { x: 0, y: 0 }, data }]),
      edges: ref([]),
    }),
  };
});
vi.mock('@vue-flow/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vue-flow/core')>();
  const { ref } = await import('vue');
  return {
    ...actual,
    useVueFlow: () => ({
      findNode: vi.fn(),
      fitBounds: vi.fn(async () => undefined),
      fitView: vi.fn(async () => undefined),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter: vi.fn(async () => undefined),
      setViewport: vi.fn(async () => undefined),
      viewport: ref({ x: 0, y: 0, zoom: 1 }),
    }),
  };
});
vi.mock('@/utils/taskGraphLayout', () => ({
  layoutTaskGraph: (nodes: unknown[]) => nodes,
}));
const MiniMapProbe = defineComponent({
  props: { nodeColor: { type: Function, required: true } },
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'minimap-active-color',
        'data-color': props.nodeColor({ data: { status: 'active', isDimmed: false } }),
      });
  },
});
describe('TaskGraphView', () => {
  it('shows active in the legend and uses the active color in the minimap', () => {
    const wrapper = mount(TaskGraphView, {
      global: {
        stubs: {
          VueFlow: { template: '<div><slot /></div>' },
          MiniMap: MiniMapProbe,
          Controls: true,
          TaskGraphNode: true,
          UButton: true,
          UIcon: true,
        },
      },
    });
    expect(wrapper.text()).toContain('common.active');
    expect(wrapper.get('[data-testid="minimap-active-color"]').attributes('data-color')).toBe(
      'var(--color-primary-500)'
    );
    wrapper.unmount();
  });
});
