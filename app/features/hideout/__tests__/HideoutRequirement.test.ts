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
  useLocaleNumberFormatter: () => (value: number) => String(value),
}));
describe('HideoutRequirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentCount = 0;
    isComplete = false;
  });
  it('marks requirement complete when clicked while incomplete', async () => {
    const wrapper = mount(HideoutRequirement, {
      props: {
        level: 1,
        requirement: {
          count: 3,
          id: 'req-1',
          item: {
            id: 'item-1',
            name: 'Toolset',
          },
        },
        stationId: 'station-1',
      },
      global: {
        stubs: {
          AppTooltip: true,
          ContextMenu: true,
          ContextMenuItem: true,
          GameItem: true,
          UButton: true,
          UIcon: true,
        },
      },
    });
    await wrapper.find('.group').trigger('click');
    expect(setHideoutPartCountMock).toHaveBeenCalledWith('req-1', 3);
    expect(setHideoutPartCompleteMock).toHaveBeenCalledWith('req-1');
  });
  it('marks requirement incomplete when clicked while complete', async () => {
    currentCount = 3;
    isComplete = true;
    const wrapper = mount(HideoutRequirement, {
      props: {
        level: 1,
        requirement: {
          count: 3,
          id: 'req-1',
          item: {
            id: 'item-1',
            name: 'Toolset',
          },
        },
        stationId: 'station-1',
      },
      global: {
        stubs: {
          AppTooltip: true,
          ContextMenu: true,
          ContextMenuItem: true,
          GameItem: true,
          UButton: true,
          UIcon: true,
        },
      },
    });
    await wrapper.find('.group').trigger('click');
    expect(setHideoutPartCountMock).toHaveBeenCalledWith('req-1', 0);
    expect(setHideoutPartUncompleteMock).toHaveBeenCalledWith('req-1');
  });
});
