// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import StashImportApply from '@/features/stash-import/StashImportApply.vue';
import StashImportDialog from '@/features/stash-import/StashImportDialog.vue';
import StashImportReview from '@/features/stash-import/StashImportReview.vue';
type Change = { id: string; type: string; before: number; count: number; needed: number };
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  commit: vi.fn(),
  recover: vi.fn(),
  select: vi.fn(),
  clear: vi.fn(),
  current: true,
  changes: {} as Record<'add' | 'replace', Change[]>,
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => ({ currentGameMode: 'pvp' }) }));
vi.mock('@/features/stash-import/useStashScanSession', () => ({
  useStashScanSession: () => {
    const rows = ref([
      {
        cell: { key: 0, x: 0, y: 0, width: 65, height: 65 },
        itemId: 'item',
        quantity: 1,
        reviewed: true,
        raidStatus: 'non_fir',
        excluded: false,
      },
    ]);
    return {
      clear: mocks.clear,
      source: ref({}),
      result: ref({
        sourceHash: 'hash',
        catalog: { items: [{ id: 'item', name: 'Item' }], missing: [] },
      }),
      rows,
      activeKey: ref(),
      active: computed(() => rows.value[0]),
      image: ref(new Blob(['fixture'])),
      width: ref(65),
      height: ref(65),
      busy: ref(false),
      error: ref(''),
      stage: ref('decode'),
      completed: ref(0),
      total: ref(1),
      remaining: computed(() => rows.value.filter((row) => !row.reviewed).length),
      select: mocks.select,
      cancel: vi.fn(),
      rescan: vi.fn(),
      region: vi.fn(),
      split: vi.fn(),
      next: vi.fn(),
    };
  },
}));
const target = (key: string, itemId: string, current: number) => ({
  key,
  itemId,
  label: key,
  current,
  need: { id: key.split(':')[1], needType: 'hideoutModule', count: 4 },
});
vi.mock('@/features/stash-import/useStashImport', () => ({
  useStashImport: () => ({
    signedIn: ref(true),
    sameLocal: () => mocks.current,
    prepare: mocks.prepare,
    commit: mocks.commit,
    recover: mocks.recover,
    estimate: (_totals: unknown, selection: string[], mode: 'add' | 'replace') => ({
      changes: mocks.changes[mode].filter((change) => selection.includes(`hideout:${change.id}`)),
      excess: 0,
    }),
    targets: (totals: { itemId: string }[]) =>
      totals.length
        ? [
            target('hideout:need', 'item', 3),
            ...totals
              .filter((total) => total.itemId === 'other')
              .map(() => target('hideout:other', 'other', 0)),
          ]
        : [],
  }),
}));
const button = (wrapper: ReturnType<typeof render>, key: string) => {
  const found = wrapper
    .findAll('button')
    .find((entry) => entry.text().startsWith(`stash_import.${key}`));
  if (!found) throw new Error(`Missing ${key}`);
  return found;
};
const hasButton = (wrapper: ReturnType<typeof render>, key: string) =>
  wrapper.findAll('button').some((entry) => entry.text().startsWith(`stash_import.${key}`));
function render() {
  return mount(StashImportDialog, {
    props: { needs: [] },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        UModal: { template: '<section><slot name="content" /></section>' },
        UIcon: true,
        UAlert: { props: ['description'], template: '<div>{{ description }}</div>' },
        StashScreenshot: true,
        StashImportReview: true,
        StashCellThumb: true,
        UButton: {
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled || loading"><slot /></button>',
        },
      },
    },
  });
}
function pasteFile(name = 'stash.png') {
  const event = new Event('paste', { cancelable: true });
  const file = new File(['pixels'], name, { type: 'image/png' });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
  document.dispatchEvent(event);
  return file;
}
async function toApply(wrapper: ReturnType<typeof render>) {
  pasteFile();
  await flushPromises();
  await button(wrapper, 'continue').trigger('click');
  await flushPromises();
}
const save = (wrapper: ReturnType<typeof render>) => wrapper.get('[data-testid=stash-save]');
describe('stash import flow', () => {
  beforeEach(() => {
    mocks.current = true;
    mocks.changes = {
      replace: [{ id: 'need', type: 'hideout', before: 3, count: 1, needed: 4 }],
      add: [{ id: 'need', type: 'hideout', before: 3, count: 4, needed: 4 }],
    };
    mocks.select.mockReset().mockResolvedValue(undefined);
    mocks.prepare
      .mockReset()
      .mockImplementation(async (_hash, _totals, selection: string[], mode: 'add' | 'replace') => ({
        mode: 'pvp',
        importMode: mode,
        excess: 0,
        changes: mocks.changes[mode].filter((change) => selection.includes(`hideout:${change.id}`)),
      }));
    mocks.commit.mockReset().mockResolvedValue({ status: 'applied' });
    mocks.recover.mockReset().mockResolvedValue(true);
  });
  it('accepts pasted images and removes the listener on close', async () => {
    const wrapper = render();
    const file = pasteFile();
    await flushPromises();
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith([file]);
    expect(wrapper.findComponent(StashImportReview).exists()).toBe(true);
    wrapper.unmount();
    pasteFile();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it('starts on the upload step and offers drag, paste and file choices', () => {
    const wrapper = render();
    expect(wrapper.find('[data-testid=stash-dropzone]').exists()).toBe(true);
    expect(wrapper.find('input[type=file]').attributes('accept')).toContain('image/png');
    expect(wrapper.text()).toContain('stash_import.drop_title');
    wrapper.unmount();
  });
  it.each([true, false])(
    'preserves selected=%s through incomplete quantity review',
    async (selected) => {
      const wrapper = render();
      await toApply(wrapper);
      const apply = wrapper.findComponent(StashImportApply);
      if (!selected) await apply.find('input[type=checkbox]').setValue(false);
      await button(wrapper, 'back').trigger('click');
      await flushPromises();
      const review = wrapper.findComponent(StashImportReview);
      review.vm.$emit('change', { quantity: 2, reviewed: false });
      await flushPromises();
      expect(button(wrapper, 'continue').attributes('disabled')).toBeDefined();
      review.vm.$emit('change', { reviewed: true });
      await flushPromises();
      await button(wrapper, 'continue').trigger('click');
      await flushPromises();
      expect(wrapper.findComponent(StashImportApply).props('selected')).toEqual(
        selected ? ['hideout:need'] : []
      );
      wrapper.unmount();
    }
  );
  it('retains a deselection when corrected rows reveal another target', async () => {
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.findComponent(StashImportApply).find('input[type=checkbox]').setValue(false);
    await button(wrapper, 'back').trigger('click');
    await flushPromises();
    wrapper.findComponent(StashImportReview).vm.$emit('change', { itemId: 'other' });
    await flushPromises();
    await button(wrapper, 'continue').trigger('click');
    await flushPromises();
    const apply = wrapper.findComponent(StashImportApply);
    expect(apply.props('selected')).toEqual([]);
    expect(apply.props('targets')).toHaveLength(2);
    wrapper.unmount();
  });
  it('blocks continuing with invalid aggregate totals until corrected', async () => {
    const wrapper = render();
    pasteFile();
    await flushPromises();
    const review = wrapper.findComponent(StashImportReview);
    review.vm.$emit('change', { quantity: 600_000, reviewed: true });
    const rows = review.props('rows');
    rows.push({ ...rows[0]!, cell: { ...rows[0]!.cell, key: 1 }, quantity: 600_000 });
    await flushPromises();
    expect(button(wrapper, 'continue').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('stash_import.errors.quantity');
    rows[1]!.quantity = 1;
    await flushPromises();
    expect(button(wrapper, 'continue').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('resets the selection for a new image', async () => {
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.findComponent(StashImportApply).find('input[type=checkbox]').setValue(false);
    await button(wrapper, 'back').trigger('click');
    await flushPromises();
    await toApply(wrapper);
    expect(wrapper.findComponent(StashImportApply).props('selected')).toEqual(['hideout:need']);
    wrapper.unmount();
  });
  it('requires acknowledging decreases in replace mode and saves the shown counts', async () => {
    const wrapper = render();
    await toApply(wrapper);
    expect(wrapper.text()).toContain('3');
    expect(save(wrapper).attributes('disabled')).toBeDefined();
    const acknowledge = wrapper.findAll('input[type=checkbox]').at(-1)!;
    await acknowledge.setValue(true);
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.prepare).toHaveBeenCalledWith(
      'hash',
      expect.any(Array),
      ['hideout:need'],
      'replace'
    );
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('stash_import.saved_replace');
    wrapper.unmount();
  });
  it('adds to current counts without a decrease prompt in add mode', async () => {
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    await flushPromises();
    expect(wrapper.text()).not.toContain('stash_import.confirm_decreases');
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.prepare).toHaveBeenCalledWith('hash', expect.any(Array), ['hideout:need'], 'add');
    expect(wrapper.text()).toContain('stash_import.saved_add');
    wrapper.unmount();
  });
  it('refuses to save numbers that differ from what was shown', async () => {
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    mocks.prepare.mockResolvedValueOnce({
      importMode: 'add',
      changes: [{ id: 'need', type: 'hideout', before: 3, count: 2, needed: 4 }],
    });
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('stash_import.errors.stale');
    wrapper.unmount();
  });
  it('reconciles a conflict and lets the player save again', async () => {
    mocks.commit.mockResolvedValueOnce({ status: 'conflict' });
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('stash_import.conflict_refreshed');
    expect(save(wrapper).attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('keeps a conflicted import locked when reconciliation fails', async () => {
    mocks.commit.mockResolvedValueOnce({ status: 'conflict' });
    mocks.recover.mockRejectedValueOnce(new Error('stash_import.errors.unsynced'));
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('stash_import.errors.unsynced');
    expect(wrapper.find('[data-testid=stash-save]').exists()).toBe(false);
    expect(hasButton(wrapper, 'refresh_progress')).toBe(true);
    await button(wrapper, 'back').trigger('click');
    await flushPromises();
    expect(mocks.recover).toHaveBeenCalledTimes(2);
    expect(wrapper.findComponent(StashImportReview).exists()).toBe(true);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('blocks a stale preview before sending any counts', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('stash_import.errors.stale'));
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('stash_import.errors.stale');
    expect(hasButton(wrapper, 'check_receipt')).toBe(false);
    wrapper.unmount();
  });
  it('offers receipt recovery after a lost response instead of repeating the write', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('stash_import.errors.save_unknown'));
    const wrapper = render();
    await toApply(wrapper);
    await wrapper.get('[data-testid=stash-mode-add] input').setValue(true);
    await save(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('stash_import.errors.save_unknown');
    expect(wrapper.find('[data-testid=stash-save]').exists()).toBe(false);
    await wrapper.get('[data-testid=stash-check-receipt]').trigger('click');
    await flushPromises();
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('stash_import.saved_add');
    wrapper.unmount();
  });
});
