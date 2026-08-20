import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HideoutRequirement from '@/features/hideout/HideoutRequirement.vue';
const setHideoutPartCompleteMock = vi.fn();
const setHideoutPartCountMock = vi.fn();
const setHideoutPartUncompleteMock = vi.fn();
let currentCount = 0;
let isComplete = false;
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getHideoutPartCount: () => currentCount,
    isHideoutPartComplete: () => isComplete,
    setHideoutPartComplete: setHideoutPartCompleteMock,
    setHideoutPartCount: setHideoutPartCountMock,
    setHideoutPartUncomplete: setHideoutPartUncompleteMock,
  }),
}));
vi.mock('@/utils/formatters', () => ({
  useLocaleNumberFormatter: () => (value: number) => value.toLocaleString('en-US'),
}));
describe('HideoutRequirement', () => {
  const defaultProps = {
    level: 1,
    requirement: {
      count: 3,
      id: 'req-1',
      item: {
        id: 'item-1',
        link: 'https://tarkov.dev/item/item-1',
        name: 'Toolset',
        wikiLink: 'https://wiki.example.com/Toolset',
      },
    },
    stationId: 'station-1',
  };
  const defaultStubs = {
    AppTooltip: true,
    ContextMenu: {
      template: '<div><slot :close="close" /></div>',
      methods: { close: vi.fn(), open: vi.fn() },
    },
    ContextMenuItem: true,
    GameItem: {
      name: 'GameItem',
      props: ['iconLink', 'image512pxLink', 'itemId'],
      template: '<div />',
    },
    UButton: true,
    UIcon: true,
  };
  const globalOptions = {
    mocks: { $t: (key: string) => key },
    stubs: defaultStubs,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    currentCount = 0;
    isComplete = false;
  });
  it('marks requirement complete when clicked while incomplete', async () => {
    const wrapper = mount(HideoutRequirement, {
      props: defaultProps,
      global: globalOptions,
    });
    await wrapper.find('.group').trigger('click');
    expect(setHideoutPartCountMock).toHaveBeenCalledWith('req-1', 3);
    expect(setHideoutPartCompleteMock).toHaveBeenCalledWith('req-1');
  });
  it('marks requirement incomplete when clicked while complete', async () => {
    currentCount = 3;
    isComplete = true;
    const wrapper = mount(HideoutRequirement, {
      props: defaultProps,
      global: globalOptions,
    });
    await wrapper.find('.group').trigger('click');
    expect(setHideoutPartCountMock).toHaveBeenCalledWith('req-1', 0);
    expect(setHideoutPartUncompleteMock).toHaveBeenCalledWith('req-1');
  });
  it.each([
    ['5449016a4bdc2d6f028b456f', 'Roubles', 400000, '₽400,000'],
    ['5696686a4bdc2da3298b456a', 'Dollars', 25000, '$25,000'],
    ['569668774bdc2da2298b4568', 'Euros', 200000, '€200,000'],
  ])('renders %s as a formatted money requirement', (itemId, name, count, expected) => {
    const wrapper = mount(HideoutRequirement, {
      props: {
        ...defaultProps,
        requirement: {
          count,
          id: `currency-${itemId}`,
          item: { id: itemId, name },
        },
      },
      global: globalOptions,
    });
    expect(wrapper.text()).toContain(expected);
    const gameItem = wrapper.findComponent({ name: 'GameItem' });
    expect(gameItem.exists()).toBe(true);
    expect(gameItem.props('itemId')).toBe(itemId);
    expect(wrapper.find('input[type="number"]').exists()).toBe(false);
  });
  it('allows long currency amounts to wrap inside the requirement card', () => {
    const wrapper = mount(HideoutRequirement, {
      props: {
        ...defaultProps,
        requirement: {
          count: 10000000,
          id: 'large-roubles-requirement',
          item: { id: '5449016a4bdc2d6f028b456f', name: 'Roubles' },
        },
      },
      global: globalOptions,
    });
    const label = wrapper.find('.text-surface-200.w-full');
    expect(label.text()).toBe('₽10,000,000');
    expect(label.classes()).toContain('break-all');
    expect(label.classes()).not.toContain('whitespace-nowrap');
  });
  it('passes currency image metadata to the in-game item display', () => {
    const wrapper = mount(HideoutRequirement, {
      props: {
        ...defaultProps,
        requirement: {
          count: 400000,
          id: 'roubles-image-requirement',
          item: {
            id: '5449016a4bdc2d6f028b456f',
            iconLink: 'https://assets.tarkov.dev/roubles-icon.webp',
            image512pxLink: 'https://assets.tarkov.dev/roubles-512.webp',
            name: 'Roubles',
          },
        },
      },
      global: globalOptions,
    });
    const gameItem = wrapper.findComponent({ name: 'GameItem' });
    expect(gameItem.props('iconLink')).toBe('https://assets.tarkov.dev/roubles-icon.webp');
    expect(gameItem.props('image512pxLink')).toBe('https://assets.tarkov.dev/roubles-512.webp');
  });
  it('keeps currency requirements manually completable without partial counters', async () => {
    const wrapper = mount(HideoutRequirement, {
      props: {
        ...defaultProps,
        requirement: {
          count: 400000,
          id: 'roubles-requirement',
          item: { id: '5449016a4bdc2d6f028b456f', name: 'Roubles' },
        },
      },
      global: globalOptions,
    });
    expect(wrapper.text()).not.toContain('0/400,000');
    await wrapper.find('.group').trigger('click');
    expect(setHideoutPartCountMock).toHaveBeenCalledWith('roubles-requirement', 400000);
    expect(setHideoutPartCompleteMock).toHaveBeenCalledWith('roubles-requirement');
  });
  it('suppresses native context menu on right-click', async () => {
    const wrapper = mount(HideoutRequirement, {
      props: defaultProps,
      global: globalOptions,
    });
    const element = wrapper.find('.group');
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 200,
    });
    element.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
