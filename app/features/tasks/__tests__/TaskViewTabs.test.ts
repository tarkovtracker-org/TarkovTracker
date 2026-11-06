// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import TaskViewTabs from '@/features/tasks/TaskViewTabs.vue';
import type { LocationQuery } from 'vue-router';
const routeState: { path: string; query: LocationQuery } = { path: '/tasks', query: {} };
const pendingSearch = ref<string | null>(null);
mockNuxtImport('useRoute', () => () => routeState);
vi.mock('@/composables/useRouteSearchQuery', async () => {
  const { computed } = await import('vue');
  const { getQueryString } = await import('@/utils/routeHelpers');
  return {
    useRouteSearchQuery: () => ({
      searchQuery: computed(
        () => pendingSearch.value ?? (getQueryString(routeState.query.q) || '')
      ),
    }),
  };
});
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const mountTabs = () =>
  mount(TaskViewTabs, {
    global: {
      stubs: {
        UIcon: true,
        NuxtLink: {
          props: ['to'],
          template: '<a v-bind="$attrs" :data-to="JSON.stringify(to)"><slot /></a>',
        },
      },
    },
  });
const linkTarget = (wrapper: ReturnType<typeof mountTabs>, view: string) =>
  JSON.parse(wrapper.get(`[data-testid="task-view-tab-${view}"]`).attributes('data-to') ?? '');
describe('TaskViewTabs', () => {
  beforeEach(() => {
    routeState.path = '/tasks';
    routeState.query = {};
    pendingSearch.value = null;
  });
  it('links every task view route', () => {
    const wrapper = mountTabs();
    expect(['list', 'traders', 'maps', 'graph'].map((view) => linkTarget(wrapper, view))).toEqual([
      { path: '/tasks', query: {} },
      { path: '/tasks/traders', query: {} },
      { path: '/tasks/maps', query: {} },
      { path: '/tasks/graph', query: {} },
    ]);
  });
  it('marks only the current view as the current page', () => {
    routeState.path = '/tasks/maps/';
    const wrapper = mountTabs();
    const current = wrapper.findAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.attributes('data-testid')).toBe('task-view-tab-maps');
  });
  it('carries the search across views but not view-specific params', () => {
    routeState.path = '/tasks/graph';
    routeState.query = { q: 'mole', status: 'all', trader: 'prapor', task: 't1' };
    const wrapper = mountTabs();
    expect(linkTarget(wrapper, 'list')).toEqual({ path: '/tasks', query: { q: 'mole' } });
    expect(linkTarget(wrapper, 'maps')).toEqual({ path: '/tasks/maps', query: { q: 'mole' } });
  });
  it('carries a search that has not reached the URL yet', () => {
    routeState.query = { q: 'mol' };
    pendingSearch.value = 'mole';
    const wrapper = mountTabs();
    expect(linkTarget(wrapper, 'traders')).toEqual({
      path: '/tasks/traders',
      query: { q: 'mole' },
    });
  });
  it('keeps the Graph tab reachable at every width and explains its width need below lg', () => {
    const graph = mountTabs().get('[data-testid="task-view-tab-graph"]');
    expect(graph.classes()).not.toContain('hidden');
    expect(graph.get('[data-testid="task-view-tab-wide-screen-hint"]').classes()).toContain(
      'lg:hidden'
    );
    const description = graph.get('.sr-only');
    expect(description.classes()).toContain('lg:hidden');
    expect(description.text()).toBe('page.tasks.primary_views.needs_wider_screen');
  });
  it('shows the wide-screen hint only on the Graph tab', () => {
    const wrapper = mountTabs();
    expect(wrapper.findAll('[data-testid="task-view-tab-wide-screen-hint"]')).toHaveLength(1);
    expect(wrapper.findAll('.sr-only')).toHaveLength(1);
  });
});
