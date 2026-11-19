// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StashSellAdvice from '@/features/stash-import/StashSellAdvice.vue';
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, values?: { count?: number }) => `${key}:${values?.count ?? ''}`,
}));
const global = {
  mocks: {
    $t: (key: string, values?: { count?: number; mode?: string; tasks?: string }) =>
      `${key}:${values?.count ?? values?.mode ?? values?.tasks ?? ''}`,
  },
  stubs: { UIcon: true, StashCellThumb: true },
};
describe('sell view', () => {
  it('shows named, counted observations in an accessible read-only section', () => {
    const wrapper = mount(StashSellAdvice, {
      props: {
        ready: true,
        modeLabel: 'PvE',
        groups: [
          {
            itemId: 'item',
            name: 'Known item',
            quantity: 3,
            cell: { key: 0, x: 0, y: 0, width: 65, height: 65 } as never,
          },
        ],
      },
      global,
    });
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(
      wrapper.get('h3').attributes('id')
    );
    expect(wrapper.text()).toContain('Known item');
    expect(wrapper.text()).toContain('stash_import.units:3');
    expect(wrapper.text()).toContain('stash_import.sell_scope:PvE');
    expect(wrapper.findAll('button,input')).toHaveLength(0);
    expect(wrapper.emitted()).toEqual({});
    wrapper.unmount();
  });
  it('never displays a stale candidate list while requirement data is unavailable', () => {
    const wrapper = mount(StashSellAdvice, {
      props: {
        ready: false,
        modeLabel: 'PvP',
        groups: [{ itemId: 'item', name: 'Stale item', quantity: 1, cell: {} as never }],
      },
      global,
    });
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('Stale item');
    wrapper.unmount();
  });
  it('distinguishes no eligible items from unavailable requirements', async () => {
    const wrapper = mount(StashSellAdvice, {
      props: { ready: true, modeLabel: 'PvP', groups: [] },
      global,
    });
    expect(wrapper.text()).toContain('stash_import.sell_empty');
    await wrapper.setProps({ ready: false });
    expect(wrapper.text()).toContain('stash_import.sell_unavailable');
    expect(wrapper.text()).not.toContain('stash_import.sell_empty');
    await wrapper.setProps({ incompleteTasks: ['Unknown quest'] });
    expect(wrapper.text()).toContain('stash_import.sell_incomplete:1');
    expect(wrapper.text()).toContain('Unknown quest');
    wrapper.unmount();
  });
});
