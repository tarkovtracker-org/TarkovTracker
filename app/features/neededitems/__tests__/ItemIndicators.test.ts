import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import ItemIndicators from '@/features/neededitems/ItemIndicators.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => `t:${key}`,
  }),
}));
const AppTooltipStub = defineComponent({
  props: ['text'],
  template: '<span class="tooltip-stub" :data-text="text"><slot /></span>',
});
function mountIndicators(props: Record<string, unknown>) {
  return mount(ItemIndicators, {
    props: {
      foundInRaid: true,
      isCraftable: true,
      kappaRequired: true,
      lightkeeperRequired: true,
      ...props,
    },
    global: { stubs: { AppTooltip: AppTooltipStub, UIcon: true } },
  });
}
const tooltipTexts = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.tooltip-stub').map((tooltip) => tooltip.attributes('data-text'));
describe('ItemIndicators', () => {
  it('takes every tooltip label from i18n', () => {
    expect(tooltipTexts(mountIndicators({}))).toEqual([
      't:common.found_in_raid_required',
      't:needed_items.task_kappa_req',
      't:page.tasks.questcard.lightkeeper_tooltip',
      't:needed_items.craft.craftable',
    ]);
  });
  it('prefers a non-blank craftable title over the default label', () => {
    const wrapper = mountIndicators({ craftableTitle: 'Workbench 1' });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Workbench 1');
    const blank = mountIndicators({ craftableTitle: '   ' });
    expect(blank.find('button').attributes('aria-label')).toBe('t:needed_items.craft.craftable');
  });
});
