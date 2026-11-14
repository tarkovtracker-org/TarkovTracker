import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const activeCount = ref(0);
const clearAll = vi.fn();
const preferences = reactive({
  getTaskPrimaryView: 'all',
  getTaskSecondaryView: 'all',
  getTaskUserView: 'self',
});
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => preferences }));
vi.mock('@/features/tasks/composables/useTaskContentFilters', () => ({
  useTaskContentFilters: () => ({ activeCount, clearAll }),
}));
const UAlertStub = {
  props: ['title', 'actions'],
  template: `<div><p data-testid="title">{{ title }}</p><button
    v-for="action in actions ?? []"
    :key="action.label"
    data-testid="action"
    @click="action.onClick"
  >{{ action.label }}</button></div>`,
};
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: createTestLocaleMessages({
    filter_menu: { clear_filters: 'Clear filters ({count})' },
  }),
});
const mountEmptyState = async (isSearching: boolean, showProgressGuidance = false) => {
  preferences.getTaskPrimaryView = 'all';
  preferences.getTaskSecondaryView = showProgressGuidance ? 'available' : 'all';
  preferences.getTaskUserView = 'self';
  const { default: TaskEmptyState } = await import('@/features/tasks/TaskEmptyState.vue');
  return mount(TaskEmptyState, {
    props: { isSearching },
    global: {
      plugins: [i18n],
      stubs: {
        UAlert: UAlertStub,
        DashboardUpNext: { template: '<div data-testid="progress-guidance" />' },
      },
    },
  });
};
describe('TaskEmptyState', () => {
  it('replaces generic advice only for an unfiltered, non-searching personal Available list', async () => {
    activeCount.value = 0;
    const wrapper = await mountEmptyState(false, true);
    expect(wrapper.find('[data-testid="progress-guidance"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="title"]').exists()).toBe(false);
    await wrapper.setProps({ isSearching: true });
    expect(wrapper.find('[data-testid="progress-guidance"]').exists()).toBe(false);
    preferences.getTaskUserView = 'teammate-id';
    await wrapper.setProps({ isSearching: false });
    expect(wrapper.find('[data-testid="progress-guidance"]').exists()).toBe(false);
  });
  it.each([
    ['getTaskPrimaryView', 'maps'],
    ['getTaskPrimaryView', 'traders'],
    ['getTaskUserView', 'all'],
    ['getTaskUserView', 'teammate-id'],
    ['getTaskSecondaryView', 'locked'],
    ['getTaskSecondaryView', 'completed'],
  ] as const)('keeps the existing empty state for %s=%s', async (key, value) => {
    activeCount.value = 0;
    const wrapper = await mountEmptyState(false, true);
    preferences[key] = value;
    await nextTick();
    expect(wrapper.find('[data-testid="progress-guidance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="title"]').exists()).toBe(true);
  });
  it('keeps filter recovery ahead of progress guidance', async () => {
    activeCount.value = 1;
    const wrapper = await mountEmptyState(false, true);
    expect(wrapper.find('[data-testid="progress-guidance"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="action"]').text()).toBe('Clear filters (1)');
  });
  it('offers no clear action when no filter is active', async () => {
    activeCount.value = 0;
    const wrapper = await mountEmptyState(false);
    expect(wrapper.find('[data-testid="action"]').exists()).toBe(false);
  });
  it.each([false, true])(
    'offers to clear active filters with their count (searching: %s)',
    async (isSearching) => {
      activeCount.value = 2;
      clearAll.mockClear();
      const wrapper = await mountEmptyState(isSearching);
      const action = wrapper.get('[data-testid="action"]');
      expect(action.text()).toBe('Clear filters (2)');
      await action.trigger('click');
      expect(clearAll).toHaveBeenCalledTimes(1);
    }
  );
});
