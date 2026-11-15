// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import StashImportDialog from '@/features/stash-import/StashImportDialog.vue';
import StashImportReview from '@/features/stash-import/StashImportReview.vue';
import StashImportTargets from '@/features/stash-import/StashImportTargets.vue';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  commit: vi.fn(),
  recover: vi.fn(),
  select: vi.fn(),
  current: true,
}));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => ({ currentGameMode: 'pvp' }) }));
vi.mock('@/features/stash-import/useStashScanSession', () => ({
  useStashScanSession: () => {
    const rows = ref([
      {
        cell: { key: 0 },
        itemId: 'item',
        quantity: 1,
        reviewed: true,
        raidStatus: 'non_fir',
        excluded: false,
      },
    ]);
    return {
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
      remaining: ref(0),
      select: mocks.select,
    };
  },
}));
vi.mock('@/features/stash-import/useStashImport', () => ({
  useStashImport: () => ({
    signedIn: ref(true),
    sameLocal: () => mocks.current,
    prepare: mocks.prepare,
    commit: mocks.commit,
    recover: mocks.recover,
    targets: (totals: { itemId: string }[]) =>
      totals.length
        ? [
            {
              key: 'hideout:need',
              itemId: 'item',
              label: 'Workbench',
              current: 3,
              need: { count: 4 },
            },
            ...totals
              .filter((total) => total.itemId === 'other')
              .map(() => ({
                key: 'hideout:other',
                itemId: 'other',
                label: 'Other',
                current: 0,
                need: { count: 1 },
              })),
          ]
        : [],
  }),
}));
const button = (wrapper: ReturnType<typeof render>, key: string) => {
  const found = wrapper.findAll('button').find((entry) => entry.text() === `stash_import.${key}`);
  if (!found) throw new Error(`Missing ${key}`);
  return found;
};
function render() {
  return mount(StashImportDialog, {
    props: { needs: [] },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        UModal: { template: '<section><slot name="body" /></section>' },
        UIcon: true,
        StashScreenshot: true,
        StashImportReview: true,
        UButton: {
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled || loading"><slot /></button>',
        },
      },
    },
  });
}
describe('stash import confirmation', () => {
  beforeEach(() => {
    mocks.current = true;
    mocks.prepare.mockReset().mockResolvedValue({
      mode: 'pvp',
      excess: 0,
      changes: [
        { id: 'need', type: 'hideout', before: 3, count: 1, label: 'Workbench', itemId: 'item' },
      ],
    });
    mocks.commit.mockReset().mockResolvedValue({ status: 'applied' });
    mocks.recover.mockReset().mockResolvedValue(true);
  });
  it('accepts pasted images while modal controls have focus and removes the listener on close', async () => {
    const wrapper = render();
    const file = new File(['pixels'], 'stash.png', { type: 'image/png' });
    const paste = () => {
      const event = new Event('paste', { cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
      document.dispatchEvent(event);
    };
    paste();
    await flushPromises();
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith([file]);
    wrapper.unmount();
    paste();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'preserves selected=%s through incomplete quantity review',
    async (selected) => {
      const wrapper = render();
      const targets = wrapper.findComponent(StashImportTargets);
      if (!selected) await targets.find('input[type=checkbox]').setValue(false);
      const review = wrapper.findComponent(StashImportReview);
      review.vm.$emit('change', { quantity: 2, reviewed: false });
      await flushPromises();
      review.vm.$emit('change', { reviewed: true });
      await flushPromises();
      expect(targets.props('modelValue')).toEqual(selected ? ['hideout:need'] : []);
      wrapper.unmount();
    }
  );
  it('retains a deselection when corrected rows reveal another target', async () => {
    const wrapper = render();
    const targets = wrapper.findComponent(StashImportTargets);
    await targets.find('input[type=checkbox]').setValue(false);
    wrapper.findComponent(StashImportReview).vm.$emit('change', { itemId: 'other' });
    await flushPromises();
    expect(targets.props('modelValue')).toEqual([]);
    expect(targets.props('availableTargets')).toHaveLength(2);
    wrapper.unmount();
  });
  it('filters removed targets and explicitly resets selection for a new image', async () => {
    const wrapper = render();
    const targets = wrapper.findComponent(StashImportTargets);
    expect(targets.props('modelValue')).toEqual(['hideout:need']);
    wrapper.findComponent(StashImportReview).vm.$emit('change', { itemId: 'other' });
    await flushPromises();
    targets.vm.$emit('update:modelValue', ['hideout:other']);
    await flushPromises();
    wrapper.findComponent(StashImportReview).vm.$emit('change', { itemId: 'item' });
    await flushPromises();
    expect(targets.props('modelValue')).toEqual([]);
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [new File(['pixels'], 'new.png')] },
    });
    document.dispatchEvent(event);
    await flushPromises();
    expect(targets.props('modelValue')).toEqual(['hideout:need']);
    wrapper.unmount();
  });
  it('retains the conflicted preview when reconciliation fails', async () => {
    mocks.commit.mockResolvedValueOnce({ status: 'conflict' });
    mocks.recover.mockRejectedValueOnce(new Error('stash_import.errors.unsynced'));
    const wrapper = render();
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    await wrapper.find('input[type=checkbox]').setValue(true);
    await button(wrapper, 'apply').trigger('click');
    await flushPromises();
    await button(wrapper, 'back').trigger('click');
    await flushPromises();
    expect(button(wrapper, 'apply').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('stash_import.errors.unsynced');
    expect(wrapper.findAll('button').some((entry) => entry.text() === 'stash_import.preview')).toBe(
      false
    );
    wrapper.unmount();
  });
  it('locks a conflicted preview until returning through reconciliation', async () => {
    mocks.commit.mockResolvedValueOnce({ status: 'conflict' });
    let finish!: (value: boolean) => void;
    mocks.recover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = render();
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    await wrapper.find('input[type=checkbox]').setValue(true);
    await button(wrapper, 'apply').trigger('click');
    await flushPromises();
    expect(button(wrapper, 'apply').attributes('disabled')).toBeDefined();
    await button(wrapper, 'back').trigger('click');
    await flushPromises();
    expect(button(wrapper, 'back').attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'apply').attributes('disabled')).toBeDefined();
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    finish(false);
    await flushPromises();
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(button(wrapper, 'preview').exists()).toBe(true);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('shows exact counts and requires acknowledgement before decreasing progress', async () => {
    const wrapper = render();
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    expect(wrapper.find('tbody').text()).toContain('Item · Workbench31');
    expect(button(wrapper, 'apply').attributes('disabled')).toBeDefined();
    await wrapper.find('input[type=checkbox]').setValue(true);
    await button(wrapper, 'apply').trigger('click');
    await flushPromises();
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('stash_import.saved');
    wrapper.unmount();
  });
  it('blocks a stale preview before sending any counts', async () => {
    mocks.current = false;
    const wrapper = render();
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    await wrapper.find('input[type=checkbox]').setValue(true);
    expect(button(wrapper, 'apply').attributes('disabled')).toBeDefined();
    expect(mocks.commit).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('offers receipt recovery after a lost response instead of repeating the write', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('stash_import.errors.save_unknown'));
    const wrapper = render();
    await button(wrapper, 'preview').trigger('click');
    await flushPromises();
    await wrapper.find('input[type=checkbox]').setValue(true);
    await button(wrapper, 'apply').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('stash_import.errors.save_unknown');
    expect(wrapper.findAll('button').some((entry) => entry.text() === 'stash_import.apply')).toBe(
      false
    );
    await button(wrapper, 'check_receipt').trigger('click');
    await flushPromises();
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('stash_import.saved');
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
    wrapper.unmount();
  });
});
