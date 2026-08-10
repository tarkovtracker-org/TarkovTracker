import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import GameItem from '@/components/ui/GameItem.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => key,
  }),
}));
vi.mock('@/composables/useWikiLink', () => ({
  useWikiLink: () => ({ toWikiUrl: (url: string | null | undefined) => url }),
}));
vi.mock('@/utils/formatters', () => ({
  useLocaleNumberFormatter: () => (value: number) => String(value),
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/utils/redirect', () => ({
  openExternalUrl: vi.fn(),
}));
const openMock = vi.fn();
const ContextMenuStub = defineComponent({
  template: '<div><slot :close="close" /></div>',
  setup(_, { expose }) {
    const close = vi.fn();
    expose({ open: openMock, close });
    return { close };
  },
});
const defaultStubs = {
  AppTooltip: true,
  ContextMenu: ContextMenuStub,
  ContextMenuItem: true,
  ItemCountControls: true,
  NuxtImg: true,
  NuxtLink: true,
  UIcon: true,
};
describe('GameItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('suppresses native context menu synchronously on right-click', async () => {
    const wrapper = mount(GameItem, {
      props: {
        itemId: 'test-item',
        itemName: 'Test Item',
        devLink: 'https://tarkov.dev/item/test',
        simpleMode: true,
        isVisible: true,
      },
      global: { stubs: defaultStubs },
    });
    const rootDiv = wrapper.find('.group');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    rootDiv.element.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
  it('opens custom context menu after mount via nextTick', async () => {
    const wrapper = mount(GameItem, {
      props: {
        itemId: 'test-item',
        itemName: 'Test Item',
        devLink: 'https://tarkov.dev/item/test',
        simpleMode: true,
        isVisible: true,
      },
      global: { stubs: defaultStubs },
    });
    const rootDiv = wrapper.find('.group');
    await rootDiv.trigger('contextmenu');
    await flushPromises();
    expect(openMock).toHaveBeenCalledTimes(1);
  });
  it('does not open context menu when no links are available', async () => {
    const wrapper = mount(GameItem, {
      props: {
        itemId: 'test-item',
        simpleMode: true,
        isVisible: true,
      },
      global: { stubs: defaultStubs },
    });
    const rootDiv = wrapper.find('.group');
    await rootDiv.trigger('contextmenu');
    await flushPromises();
    expect(openMock).not.toHaveBeenCalled();
  });
});
