// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { FOCUS_APP_SEARCH_EVENT } from '@/composables/useKeybinds';
import type { HideoutStation, TarkovItem, Task } from '@/types/tarkov';
import type { VueWrapper } from '@vue/test-utils';
type QueryRecord = Record<string, string | undefined>;
const routeState = reactive({
  name: 'index',
  path: '/',
  query: {} as QueryRecord,
});
const setRoute = (name: string, path: string, query: QueryRecord = {}) => {
  routeState.name = name;
  routeState.path = path;
  routeState.query = query;
};
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  routeState.query = query;
});
const push = vi.fn(async () => {});
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  currentRoute: { value: routeState },
  push,
  replace,
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
}));
const metadataState = reactive({
  tasks: [
    { id: 't1', name: 'Gunsmith - Part 1', map: { name: 'Factory' } },
    { id: 't2', name: 'Gunsmith - Part 2' },
  ] as Task[],
  items: [{ id: 'i1', name: 'Gunpowder "Eagle"', shortName: 'Eagle' }] as TarkovItem[],
  hideoutStations: [{ id: 'h1', name: 'Workbench' }] as HideoutStation[],
});
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataState,
}));
// Forwards attrs to the native input and exposes `inputRef`, like Nuxt UI's UInput.
const UInputStub = defineComponent({
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'focus'],
  setup(_, { expose }) {
    const inputRef = ref<HTMLInputElement | null>(null);
    expose({ inputRef });
    return { inputRef };
  },
  template:
    '<div><input ref="inputRef" v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @focus="$emit(\'focus\', $event)" /><slot name="trailing" /></div>',
});
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false });
let wrapper: VueWrapper | undefined;
const mountSearch = async () => {
  const { default: AppSearch } = await import('@/features/omnibar/AppSearch.vue');
  wrapper = mount(AppSearch, {
    attachTo: document.body,
    props: { shortcutParts: ['Ctrl', 'K'], keyShortcuts: 'Control+K' },
    global: {
      plugins: [i18n],
      stubs: {
        UInput: UInputStub,
        UButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
        UKbd: { template: '<kbd><slot /></kbd>' },
      },
    },
  });
  return wrapper;
};
const input = () => wrapper!.find<HTMLInputElement>('input');
const typeQuery = async (value: string) => {
  input().element.focus();
  await input().setValue(value);
  await vi.advanceTimersByTimeAsync(250);
};
const press = (key: string) => input().trigger('keydown', { key });
const optionLabels = () =>
  wrapper!.findAll('[data-testid="app-search-option"]').map((option) => option.text());
const listboxShown = () => input().attributes('aria-expanded') === 'true';
describe('AppSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setRoute('index', '/');
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });
  it('navigates to the result chosen with the arrow keys', async () => {
    await mountSearch();
    await typeQuery('gunsmith');
    expect(listboxShown()).toBe(true);
    expect(optionLabels()).toEqual(['Gunsmith - Part 1Factory', 'Gunsmith - Part 2']);
    await press('ArrowDown');
    await press('ArrowDown');
    expect(input().attributes('aria-activedescendant')).toBe(
      wrapper!.findAll('[data-testid="app-search-option"]')[1]!.attributes('id')
    );
    await press('Enter');
    expect(push).toHaveBeenCalledWith({ path: '/tasks', query: { task: 't2' } });
    expect(document.activeElement).not.toBe(input().element);
  });
  it('wraps ArrowUp from no selection to the last result', async () => {
    await mountSearch();
    await typeQuery('gunsmith');
    await press('ArrowUp');
    const options = wrapper!.findAll('[data-testid="app-search-option"]');
    expect(options[1]!.attributes('aria-selected')).toBe('true');
  });
  it('jumps to the top result on Enter outside a page search', async () => {
    await mountSearch();
    await typeQuery('workbench');
    await press('Enter');
    expect(push).toHaveBeenCalledWith({ path: '/hideout', query: { station: 'h1' } });
  });
  it('filters the tasks page through ?q= and only offers other entities', async () => {
    setRoute('tasks', '/tasks', { status: 'available' });
    await mountSearch();
    await typeQuery('gun');
    expect(replace).toHaveBeenLastCalledWith({ query: { status: 'available', q: 'gun' } });
    expect(optionLabels()).toEqual(['Gunpowder "Eagle"Eagle']);
    await press('Enter');
    expect(push).not.toHaveBeenCalled();
    expect(listboxShown()).toBe(false);
  });
  it('waits for the typed query before jumping on Enter', async () => {
    await mountSearch();
    await typeQuery('workbench');
    await input().setValue('gunsmith');
    await press('Enter');
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(push).toHaveBeenCalledWith({ path: '/tasks', query: { task: 't1' } });
  });
  it('commits a pending page query when focus leaves the box', async () => {
    setRoute('tasks', '/tasks');
    await mountSearch();
    input().element.focus();
    await input().setValue('mole');
    input().element.blur();
    await vi.advanceTimersByTimeAsync(0);
    expect(replace).toHaveBeenCalledWith({ query: { q: 'mole' } });
  });
  it('reopens the results when the focused input is clicked after Escape', async () => {
    await mountSearch();
    await typeQuery('gunsmith');
    await press('Escape');
    await input().trigger('click');
    expect(listboxShown()).toBe(true);
  });
  it('scrolls the option picked with the arrow keys into view', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    await mountSearch();
    await typeQuery('gunsmith');
    await press('ArrowUp');
    await nextTick();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      wrapper!.findAll('[data-testid="app-search-option"]')[1]!.element
    );
  });
  it('starts from the page query and follows outside changes while blurred', async () => {
    setRoute('needed-items', '/needed-items', { q: 'salewa' });
    await mountSearch();
    expect(input().element.value).toBe('salewa');
    routeState.query = {};
    await nextTick();
    expect(input().element.value).toBe('');
  });
  it('clears the page search from the clear button', async () => {
    setRoute('tasks', '/tasks', { q: 'mole' });
    await mountSearch();
    await wrapper!.find('button[aria-label="common.clear_search"]').trigger('click');
    expect(replace).toHaveBeenCalledWith({ query: { q: undefined } });
    expect(input().element.value).toBe('');
    expect(document.activeElement).toBe(input().element);
  });
  it('focuses the input when a search shortcut fires', async () => {
    await mountSearch();
    window.dispatchEvent(new CustomEvent(FOCUS_APP_SEARCH_EVENT));
    expect(document.activeElement).toBe(input().element);
  });
  it('closes the results on Escape, then leaves the input on a second Escape', async () => {
    await mountSearch();
    await typeQuery('gunsmith');
    await press('Escape');
    expect(listboxShown()).toBe(false);
    expect(document.activeElement).toBe(input().element);
    await press('Escape');
    expect(document.activeElement).not.toBe(input().element);
  });
  it('resets the draft when leaving for a page without its own search', async () => {
    setRoute('tasks', '/tasks', { q: 'mole' });
    await mountSearch();
    setRoute('hideout', '/hideout');
    await nextTick();
    expect(input().element.value).toBe('');
  });
});
