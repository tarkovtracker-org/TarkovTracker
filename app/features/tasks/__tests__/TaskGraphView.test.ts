// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import TaskGraphView from '@/features/tasks/TaskGraphView.vue';
import type { TaskNodeData } from '@/composables/useTaskGraphData';
const isLgAndUp = ref(false);
const searchQuery = ref('');
const savedStatus = ref<string | null>('locked');
mockNuxtImport('useSharedBreakpoints', () => () => ({ lgAndUp: computed(() => isLgAndUp.value) }));
mockNuxtImport('useRouter', () => () => ({ push: vi.fn() }));
vi.mock('@/composables/useRouteSearchQuery', () => ({
  useRouteSearchQuery: () => ({ searchQuery: computed(() => searchQuery.value) }),
}));
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
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getTaskTraderView: '54cb57776803fa99248b456e',
    getTaskSecondaryView: 'all',
    get taskSecondaryView() {
      return savedStatus.value;
    },
    getTaskSortMode: 'alphabetical',
    getTaskSortDirection: 'asc',
    setTaskPrimaryView: vi.fn(),
  }),
}));
vi.mock('pinia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pinia')>()),
  storeToRefs: (store: Record<string, unknown>) => ({
    getTaskTraderView: ref(store.getTaskTraderView),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
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
const mountGraph = () =>
  mount(TaskGraphView, {
    global: {
      stubs: {
        UIcon: true,
        UButton: {
          props: ['to'],
          template: '<a v-bind="$attrs" :data-to="JSON.stringify(to)"><slot /></a>',
        },
        VueFlow: { template: '<div><slot /></div>' },
        MiniMap: MiniMapProbe,
        Controls: true,
      },
    },
  });
describe('TaskGraphView narrow screens', () => {
  beforeEach(() => {
    isLgAndUp.value = false;
    searchQuery.value = '';
    savedStatus.value = 'locked';
  });
  it('explains the width requirement under a labelled heading', () => {
    const notice = mountGraph().get('[data-testid="task-graph-narrow"]');
    const heading = notice.get('h2');
    expect(notice.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(heading.text()).toBe('page.tasks.graph.narrow_title');
    expect(notice.text()).toContain('page.tasks.graph.narrow_description:{"width":1024}');
  });
  it.each([
    ['', 'locked', 'locked'],
    ['mole', 'locked', 'locked'],
    ['', null, 'available'],
  ] as const)(
    'keeps search %j and saved status %j as %j in the Traders link',
    (search, status, expectedStatus) => {
      searchQuery.value = search;
      savedStatus.value = status;
      const link = mountGraph().get('[data-testid="task-graph-narrow-traders-link"]');
      expect(JSON.parse(link.attributes('data-to') ?? '')).toEqual({
        path: '/tasks/traders',
        query: {
          trader: '54cb57776803fa99248b456e',
          status: expectedStatus,
          sort: 'alphabetical',
          sortDir: 'asc',
          ...(search ? { q: search } : {}),
        },
      });
    }
  );
  it('replaces the notice once the window reaches the lg breakpoint', () => {
    isLgAndUp.value = true;
    expect(mountGraph().find('[data-testid="task-graph-narrow"]').exists()).toBe(false);
  });
});
describe('TaskGraphView active status', () => {
  it('shows active in the legend and uses its color in the minimap', () => {
    isLgAndUp.value = true;
    const wrapper = mountGraph();
    expect(wrapper.text()).toContain('common.active');
    expect(wrapper.get('[data-testid="minimap-active-color"]').attributes('data-color')).toBe(
      'var(--color-primary-500)'
    );
    wrapper.unmount();
  });
});
