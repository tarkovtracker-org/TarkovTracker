import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StashImportReview from '@/features/stash-import/StashImportReview.vue';
import type { ReviewedCell, ScanCell, ScanResult } from '@/utils/stashScan/types';
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, values?: { count?: number }) => `${key}:${values?.count ?? ''}`,
}));
const cell = (key: number, itemId: string): ScanCell => ({
  key,
  x: key * 65,
  y: 0,
  width: 65,
  height: 65,
  slotsWide: 1,
  slotsHigh: 1,
  empty: false,
  candidates: [{ itemId, score: 0.6, artScore: 0.6, textScore: 0.6 }],
  margin: 0.01,
  fir: false,
  stack: 1,
});
const row = (key: number, itemId: string, reviewed: boolean): ReviewedCell => ({
  cell: cell(key, itemId),
  itemId,
  quantity: 1,
  raidStatus: 'unknown',
  reviewed,
  excluded: false,
});
const result = { catalog: { items: [], missing: [] } } as unknown as ScanResult;
function render(tracked: ReadonlySet<string>) {
  return mount(StashImportReview, {
    props: {
      result,
      rows: [row(0, 'ledx', false), row(1, 'rifle', false), row(2, 'ledx', true)],
      tracked,
      remaining: 1,
      itemName: (id: string) => id,
    },
    global: {
      mocks: { $t: (key: string, values?: { count?: number }) => `${key}:${values?.count ?? ''}` },
      stubs: {
        UButton: { template: '<button><slot /></button>' },
        StashReviewRow: { props: ['row'], template: '<div class="row">{{ row.itemId }}</div>' },
      },
    },
  });
}
describe('StashImportReview', () => {
  it('lists blocking rows first and keeps unneeded uncertain rows under their own heading', () => {
    const wrapper = render(new Set(['ledx']));
    expect(wrapper.findAll('.row').map((entry) => entry.text())).toEqual(['ledx', 'rifle']);
    expect(wrapper.text()).toContain('stash_import.skip_heading:1');
  });
  it('shows no Not needed section when every uncertain row matters', () => {
    const wrapper = render(new Set(['ledx', 'rifle']));
    expect(wrapper.findAll('.row').map((entry) => entry.text())).toEqual(['ledx', 'rifle']);
    expect(wrapper.text()).not.toContain('stash_import.skip_heading');
  });
  it('opens a Not needed row where it is instead of moving it into the main list', async () => {
    const wrapper = render(new Set(['ledx']));
    await wrapper.setProps({ activeKey: 1 });
    expect(wrapper.findAll('.row').map((entry) => entry.text())).toEqual(['ledx', 'rifle']);
    expect(wrapper.text()).toContain('stash_import.skip_heading:1');
  });
});
