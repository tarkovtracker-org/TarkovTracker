// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StashCellEditor from '@/features/stash-import/StashCellEditor.vue';
import type { ReviewedCell } from '@/utils/stashScan/types';
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
        items: [{ id: 'item', name: 'Item', shortName: 'Item', maxStack: 1, width: 1, height: 1 }],
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
    await wrapper.find('input[type=number]').setValue('2');
    const patch = wrapper.emitted('change')?.[0]?.[0] as Partial<ReviewedCell>;
    expect(patch).toMatchObject({ quantity: 2, reviewed: false });
    await wrapper.setProps({ row: { ...row, ...patch } });
    const confirm = wrapper
      .findAll('button')
      .find((entry) => entry.text() === 'stash_import.confirm_next')!;
    expect(confirm.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
