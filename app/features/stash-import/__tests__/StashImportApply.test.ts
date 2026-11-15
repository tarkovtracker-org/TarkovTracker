// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StashImportApply from '@/features/stash-import/StashImportApply.vue';
import type { ImportChange, ImportTarget } from '@/features/stash-import/useStashImport';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const target = (id: string, current: number): ImportTarget =>
  ({
    key: `hideout:${id}`,
    itemId: 'bolts',
    label: id,
    current,
    need: { id, needType: 'hideoutModule', count: 4, foundInRaid: false },
  }) as unknown as ImportTarget;
const change = (id: string, before: number, count: number): ImportChange =>
  ({ id, type: 'hideout', before, count, needed: 4, label: id, itemId: 'bolts' }) as ImportChange;
function render(selected: string[], changes: ImportChange[]) {
  return mount(StashImportApply, {
    props: {
      targets: [target('gym', 0), target('range', 0), target('stash', 4)],
      totals: [{ itemId: 'bolts', fir: 0, nonFir: 2, unknown: 0 }],
      estimates: {
        add: { changes, excess: 0 },
        replace: { changes, excess: 0 },
      },
      // With everything selected, the two units would go to the gym only.
      relevant: new Set(['hideout:gym']),
      itemName: () => 'Bolts',
      thumbFor: () => undefined,
      locked: false,
      importMode: 'replace',
      selected,
      allowDecreases: false,
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { UIcon: true, UButton: true, StashCellThumb: true },
    },
  });
}
const rowKeys = (wrapper: ReturnType<typeof render>) =>
  wrapper.findAll('input[type=checkbox][value]').map((input) => input.attributes('value'));
describe('StashImportApply requirement rows', () => {
  it('collapses requirements this import cannot change', () => {
    const wrapper = render(['hideout:gym', 'hideout:range'], [change('gym', 0, 2)]);
    expect(rowKeys(wrapper)).toEqual(['hideout:gym']);
    expect(wrapper.text()).toContain('stash_import.show_unchanged');
  });
  it('keeps an unchecked row and shows the row the items move to', () => {
    // Unchecking the gym moves both units onto the range, which the full plan never touched.
    const wrapper = render(['hideout:range'], [change('range', 0, 2)]);
    expect(rowKeys(wrapper)).toEqual(['hideout:gym', 'hideout:range']);
  });
});
