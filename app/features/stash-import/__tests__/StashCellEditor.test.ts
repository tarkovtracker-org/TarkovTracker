// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StashCellEditor from '@/features/stash-import/StashCellEditor.vue';
import StashRegionEditor from '@/features/stash-import/StashRegionEditor.vue';
import StashScreenshot from '@/features/stash-import/StashScreenshot.vue';
import type { ReviewedCell } from '@/utils/stashScan/types';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
describe('stack quantity review', () => {
  it('requires a new confirmation after editing a previously accepted quantity', async () => {
    const row: ReviewedCell = {
      cell: {
        key: 0,
        x: 0,
        y: 0,
        width: 65,
        height: 65,
        slotsWide: 1,
        slotsHigh: 1,
        candidates: [],
        margin: 1,
        empty: false,
      },
      itemId: 'item',
      quantity: 1,
      reviewed: true,
      raidStatus: 'unknown',
      excluded: false,
    };
    const wrapper = mount(StashCellEditor, {
      props: {
        row,
        items: [{ id: 'item', name: 'Item', shortName: 'Item', maxStack: 60, width: 1, height: 1 }],
      },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          UIcon: true,
          UButton: {
            props: ['disabled'],
            template: '<button :disabled="disabled"><slot /></button>',
          },
        },
      },
    });
    await wrapper.find('input[type=number]').setValue('61');
    const patch = wrapper.emitted('change')?.[0]?.[0] as Partial<ReviewedCell>;
    expect(patch).toMatchObject({ quantity: 61, reviewed: false });
    await wrapper.setProps({ row: { ...row, ...patch } });
    const confirm = wrapper
      .findAll('button')
      .find((entry) => entry.text() === 'stash_import.confirm_next')!;
    expect(confirm.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
describe('non-stackable items', () => {
  it('does not ask for an amount when the identity can only be one unit', () => {
    const row = {
      cell: { key: 0, candidates: [], slotsWide: 1, slotsHigh: 1 },
      itemId: 'item',
      quantity: 1,
      raidStatus: 'unknown',
    } as unknown as ReviewedCell;
    const wrapper = mount(StashCellEditor, {
      props: {
        row,
        items: [{ id: 'item', name: 'Item', shortName: 'Item', maxStack: 1, width: 1, height: 1 }],
      },
      global: { mocks: { $t: (key: string) => key }, stubs: { UIcon: true, UButton: true } },
    });
    expect(wrapper.find('input[type=number]').exists()).toBe(false);
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(3);
    wrapper.unmount();
  });
});
describe('correction search', () => {
  it.each(['injector', 'SJ6', 'abc123'])('finds an item using %s', async (query) => {
    const row = {
      cell: { key: 0, candidates: [], slotsWide: 1, slotsHigh: 1 },
      itemId: '',
      quantity: null,
    } as unknown as ReviewedCell;
    const wrapper = mount(StashCellEditor, {
      props: {
        row,
        items: [
          {
            id: 'abc123',
            name: 'Combat injector',
            shortName: 'SJ6',
            maxStack: 1,
            width: 1,
            height: 1,
          },
        ],
      },
      global: { mocks: { $t: (key: string) => key }, stubs: { UIcon: true, UButton: true } },
    });
    await wrapper.find('input[type=search]').setValue(query);
    expect(wrapper.find('[role=group] button').text()).toBe('Combat injector');
    wrapper.unmount();
  });
});
describe('screenshot region accessibility', () => {
  it('groups interactive regions and keeps keyboard activation available', async () => {
    const row = {
      cell: { key: 7, x: 0, y: 0, width: 65, height: 65 },
      excluded: true,
    } as ReviewedCell;
    const wrapper = mount(StashScreenshot, {
      props: { width: 65, height: 65, rows: [row] },
      global: { mocks: { $t: (key: string) => key }, stubs: { UButton: true } },
    });
    expect(wrapper.find('svg').attributes('role')).toBe('group');
    const region = wrapper.find('rect[role=button]');
    expect(region.attributes('tabindex')).toBe('0');
    // The region names its review state, matching the visible colour legend.
    expect(region.attributes('aria-label')).toBe('stash_import.region_label');
    await region.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toEqual([[7]]);
    wrapper.unmount();
  });
});
describe('manual region controls', () => {
  it('offers coordinate entry without detected regions or a pointer', async () => {
    const wrapper = mount(StashScreenshot, {
      props: { width: 130, height: 130, rows: [] },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { UButton: { template: '<button><slot /></button>' } },
      },
    });
    const entry = wrapper
      .findAll('button')
      .find((button) => button.text() === 'stash_import.enter_region');
    expect(entry).toBeDefined();
    await entry!.trigger('click');
    expect(wrapper.emitted('region')).toEqual([
      [{ x: 0, y: 0, width: 130, height: 130, slotsWide: 1, slotsHigh: 1 }],
    ]);
    wrapper.unmount();
  });
  it.each([8, 14, 15])(
    'allows splitting a %spx region only if every part is at least 8px',
    async (size) => {
      const row = {
        cell: {
          key: 0,
          x: 0,
          y: 0,
          width: size,
          height: size,
          slotsWide: 2,
          slotsHigh: 2,
          candidates: [],
        },
        quantity: 1,
        itemId: '',
        excluded: false,
      } as unknown as ReviewedCell;
      const wrapper = mount(StashCellEditor, {
        props: { row, items: [] },
        global: {
          mocks: { $t: (key: string) => key },
          stubs: {
            UIcon: true,
            UButton: {
              props: ['disabled'],
              template: '<button :disabled="disabled"><slot /></button>',
            },
          },
        },
      });
      for (const input of wrapper.findAll('details input')) await input.setValue(2);
      const split = wrapper
        .findAll('button')
        .find((button) => button.text() === 'stash_import.split_apply')!;
      expect(split.attributes('disabled') !== undefined).toBe(size < 15);
      wrapper.unmount();
    }
  );
});
describe('region coordinate editor', () => {
  function editor() {
    return mount(StashRegionEditor, {
      props: {
        modelValue: { x: 0, y: 0, width: 130, height: 130, slotsWide: 1, slotsHigh: 1 },
        width: 130,
        height: 130,
      },
      attachTo: document.body,
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          UButton: {
            props: ['disabled'],
            template: '<button :disabled="disabled"><slot /></button>',
          },
        },
      },
    });
  }
  it('focuses coordinates and submits a precisely positioned region', async () => {
    const wrapper = editor();
    expect(document.activeElement).toBe(wrapper.find('[data-coordinate=x]').element);
    await wrapper.find('[data-coordinate=x]').setValue(20);
    await wrapper.find('[data-coordinate=y]').setValue(30);
    await wrapper.find('[data-coordinate=width]').setValue(65);
    await wrapper.find('[data-coordinate=height]').setValue(65);
    const apply = wrapper
      .findAll('button')
      .find((button) => button.text() === 'stash_import.match_region')!;
    expect(apply.attributes('disabled')).toBeUndefined();
    await apply.trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.props('modelValue')).toMatchObject({ x: 20, y: 30, width: 65, height: 65 });
    wrapper.unmount();
  });
  it.each([
    ['x', -1],
    ['x', 0.5],
    ['width', 7],
    ['height', 7],
    ['x', 1],
    ['y', 1],
  ])('blocks invalid coordinate %s=%s', async (field, value) => {
    const wrapper = editor();
    await wrapper.find(`[data-coordinate=${field}]`).setValue(value);
    const apply = wrapper
      .findAll('button')
      .find((button) => button.text() === 'stash_import.match_region')!;
    expect(apply.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
