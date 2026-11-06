// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import TaskGraphView from '@/features/tasks/TaskGraphView.vue';
const isLgAndUp = ref(false);
const searchQuery = ref('');
const savedStatus = ref<string | null>('locked');
mockNuxtImport('useSharedBreakpoints', () => () => ({ lgAndUp: computed(() => isLgAndUp.value) }));
mockNuxtImport('useRouter', () => () => ({ push: vi.fn() }));
vi.mock('@/composables/useRouteSearchQuery', () => ({
  useRouteSearchQuery: () => ({ searchQuery: computed(() => searchQuery.value) }),
}));
vi.mock('@/composables/useTaskGraphData', () => ({
  useTaskGraphData: () => ({ nodes: ref([]), edges: ref([]) }),
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
const mountGraph = () =>
  mount(TaskGraphView, {
    global: {
      stubs: {
        UIcon: true,
        UButton: {
          props: ['to'],
          template: '<a v-bind="$attrs" :data-to="JSON.stringify(to)"><slot /></a>',
        },
        VueFlow: true,
        MiniMap: true,
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
