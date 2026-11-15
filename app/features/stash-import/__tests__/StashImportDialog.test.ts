// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import StashImportDialog from '@/features/stash-import/StashImportDialog.vue';
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
  useStashScanSession: () => ({
    source: ref({}),
    result: ref({
      sourceHash: 'hash',
      catalog: { items: [{ id: 'item', name: 'Item' }], missing: [] },
    }),
    rows: ref([
      {
        cell: { key: 0 },
        itemId: 'item',
        quantity: 1,
        reviewed: true,
        raidStatus: 'non_fir',
        excluded: false,
      },
    ]),
    activeKey: ref(),
    active: ref(),
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
  }),
}));
vi.mock('@/features/stash-import/useStashImport', () => ({
  useStashImport: () => ({
    signedIn: ref(true),
    sameLocal: () => mocks.current,
    prepare: mocks.prepare,
    commit: mocks.commit,
    recover: mocks.recover,
    targets: () => [
      { key: 'hideout:need', itemId: 'item', label: 'Workbench', current: 3, need: { count: 4 } },
    ],
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
    wrapper.unmount();
  });
});
