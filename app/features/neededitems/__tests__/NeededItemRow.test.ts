import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import {
  createDefaultNeededItemContext,
  neededItemKey,
} from '@/features/neededitems/neededitem-keys';
import NeededItemRow from '@/features/neededitems/NeededItemRow.vue';
import type { NeededItemHideoutModule } from '@/types/tarkov';
const belowMd = ref(false);
vi.mock('@/composables/useSharedBreakpoints', () => ({
  useSharedBreakpoints: () => ({ belowMd }),
}));
vi.mock('@/composables/useItemRowIntersection', () => ({
  useItemRowIntersection: () => ({ isVisible: ref(true) }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ playerLevel: () => 10 }),
}));
vi.mock('@/features/hideout/StationLink.vue', () => ({
  __esModule: true,
  default: {
    props: ['station', 'moduleId'],
    template: '<a class="station-link">{{ station.name }}</a>',
  },
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ locale: ref('en'), t: (key: string) => key }),
}));
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;
const passthrough = (name: string) =>
  defineComponent({ name, template: '<div><slot /><slot name="content" /></div>' });
const hideoutNeed = {
  id: 'need-1',
  needType: 'hideoutModule',
  count: 3,
  foundInRaid: false,
  hideoutModule: { id: 'module-1', level: 2 },
} as unknown as NeededItemHideoutModule;
function mountRow() {
  const context = {
    ...createDefaultNeededItemContext(),
    neededCount: computed(() => 3),
    levelRequired: computed(() => 15),
    lockedBefore: computed(() => 2),
    relatedStation: computed(() => ({ id: 'station-1', name: 'Workbench' })),
  };
  return mount(NeededItemRow, {
    props: { need: hideoutNeed },
    global: {
      mocks: { $t: translate },
      provide: { [neededItemKey as symbol]: context },
      stubs: {
        GameItem: true,
        ItemIndicators: true,
        AcceptedItemsPopover: true,
        TeamNeedsDisplay: true,
        ItemCountControls: true,
        UIcon: true,
        UButton: passthrough('UButton'),
        UModal: passthrough('UModal'),
        UCard: passthrough('UCard'),
      },
    },
  });
}
const levelLabel = translate('common.lvl_level', { level: 2 });
describe('NeededItemRow hideout needs', () => {
  it('shows one station link with its level on desktop', async () => {
    belowMd.value = false;
    const wrapper = mountRow();
    await flushPromises();
    expect(wrapper.findAll('.station-link')).toHaveLength(1);
    expect(wrapper.text()).toContain(levelLabel);
    expect(wrapper.text()).toContain(translate('common.lvl_level', { level: 15 }));
    expect(wrapper.text()).toContain(translate('needed_items.locked_before', { count: 2 }));
  });
  it('shows one station link with its level in each mobile section', async () => {
    belowMd.value = true;
    const wrapper = mountRow();
    await flushPromises();
    expect(wrapper.findAll('.station-link')).toHaveLength(2);
    expect(wrapper.text().split(levelLabel)).toHaveLength(3);
  });
});
