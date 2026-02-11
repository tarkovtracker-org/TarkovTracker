import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
type MetadataStoreMock = {
  editionsError: Error | null;
  editionsLoading: boolean;
  error: Error | null;
  fetchAllData: ReturnType<typeof vi.fn>;
  hasInitialized: boolean;
  hideoutError: Error | null;
  hideoutLoading: boolean;
  prestigeError: Error | null;
  prestigeLoading: boolean;
  loading: boolean;
};
const createMetadataStore = (overrides: Partial<MetadataStoreMock> = {}) =>
  reactive<MetadataStoreMock>({
    editionsError: null,
    editionsLoading: false,
    error: null,
    fetchAllData: vi.fn(),
    hasInitialized: false,
    hideoutError: null,
    hideoutLoading: false,
    loading: false,
    prestigeError: null,
    prestigeLoading: false,
    ...overrides,
  });
const setup = async (overrides: Partial<MetadataStoreMock> = {}, attachTo?: HTMLElement) => {
  vi.resetModules();
  const metadataStore = createMetadataStore(overrides);
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  const { default: LoadingScreen } = await import('@/shell/LoadingScreen.vue');
  const wrapper = mount(LoadingScreen, {
    attachTo,
    global: {
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        UButton: {
          props: ['disabled', 'loading'],
          template:
            '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
    },
  });
  return { metadataStore, wrapper };
};
describe('LoadingScreen', () => {
  it('does not render overlay when not initialized but no loading or errors', async () => {
    const { wrapper } = await setup();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
  it('renders overlay while metadata is loading', async () => {
    const { wrapper } = await setup({ loading: true });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });
  it('renders overlay when metadata has critical errors', async () => {
    const { wrapper } = await setup({ error: new Error('Failed to load metadata') });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });
  it('provides dialog labelling attributes', async () => {
    const { wrapper } = await setup({ loading: true });
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-labelledby')).toBe('loading-screen-title');
    expect(dialog.attributes('aria-describedby')).toBe('loading-screen-description');
  });
  it('dismisses the overlay when continue is clicked', async () => {
    const { wrapper } = await setup({ error: new Error('Failed to load metadata') });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    await buttons[1]!.trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
  it('prevents duplicate retries while fetch is in flight', async () => {
    let resolveRetry: (() => void) | null = null;
    const fetchAllData = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );
    const { metadataStore, wrapper } = await setup({
      error: new Error('Failed to load metadata'),
      fetchAllData,
    });
    const retryButton = wrapper.findAll('button')[0]!;
    await retryButton.trigger('click');
    await retryButton.trigger('click');
    expect(metadataStore.fetchAllData).toHaveBeenCalledTimes(1);
    expect(metadataStore.fetchAllData).toHaveBeenCalledWith(true);
    expect(retryButton.attributes('disabled')).toBeDefined();
    expect(retryButton.attributes('data-loading')).toBe('true');
    resolveRetry!();
    await flushPromises();
    expect(wrapper.findAll('button')[0]?.attributes('disabled')).toBeUndefined();
  });
  it('restores sibling inert and aria-hidden attributes when overlay closes', async () => {
    const { metadataStore, wrapper } = await setup({ loading: true });
    const overlay = wrapper.get('[role="dialog"]').element as HTMLElement;
    const parent = overlay.parentElement;
    expect(parent).not.toBeNull();
    const siblingWithAttrs = document.createElement('div');
    const siblingPlain = document.createElement('div');
    siblingWithAttrs.setAttribute('aria-hidden', 'false');
    siblingWithAttrs.setAttribute('inert', '');
    parent?.appendChild(siblingWithAttrs);
    parent?.appendChild(siblingPlain);
    metadataStore.loading = false;
    await flushPromises();
    metadataStore.loading = true;
    await flushPromises();
    expect(siblingWithAttrs.getAttribute('aria-hidden')).toBe('true');
    expect(siblingWithAttrs.hasAttribute('inert')).toBe(true);
    expect(siblingPlain.getAttribute('aria-hidden')).toBe('true');
    expect(siblingPlain.hasAttribute('inert')).toBe(true);
    metadataStore.loading = false;
    await flushPromises();
    expect(siblingWithAttrs.getAttribute('aria-hidden')).toBe('false');
    expect(siblingWithAttrs.hasAttribute('inert')).toBe(true);
    expect(siblingPlain.hasAttribute('inert')).toBe(false);
    expect(siblingPlain.getAttribute('aria-hidden')).toBeNull();
    siblingWithAttrs.remove();
    siblingPlain.remove();
  });
});
