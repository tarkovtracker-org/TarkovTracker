// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useScreenshotBitmap } from '@/features/stash-import/useScreenshotBitmap';
type FakeBitmap = { id: string; close: ReturnType<typeof vi.fn> };
const pending = new Map<string, (bitmap: FakeBitmap) => void>();
const bitmap = (id: string): FakeBitmap => ({ id, close: vi.fn() });
vi.stubGlobal(
  'createImageBitmap',
  (blob: Blob & { label?: string }) =>
    new Promise((resolve) => pending.set(blob.label ?? '', resolve as (b: FakeBitmap) => void))
);
const blob = (label: string) => Object.assign(new Blob([label]), { label });
async function decoded(label: string, value: FakeBitmap) {
  pending.get(label)?.(value);
  await flushPromises();
}
afterEach(() => pending.clear());
describe('shared screenshot bitmap', () => {
  it('keeps the previous frame until the replacement decodes, then closes it', async () => {
    const image = ref<Blob>(blob('first'));
    const scope = effectScope();
    const state = scope.run(() => useScreenshotBitmap(image))!;
    const first = bitmap('first');
    await decoded('first', first);
    expect(state.bitmap.value).toBe(first);
    image.value = blob('second');
    await nextTick();
    expect(state.bitmap.value).toBe(first);
    const second = bitmap('second');
    await decoded('second', second);
    expect(state.bitmap.value).toBe(second);
    expect(first.close).toHaveBeenCalledOnce();
    scope.stop();
    expect(second.close).toHaveBeenCalledOnce();
  });
  it('closes a decode that finishes after a newer image was chosen', async () => {
    const image = ref<Blob | undefined>(blob('slow'));
    const scope = effectScope();
    const state = scope.run(() => useScreenshotBitmap(() => image.value))!;
    image.value = blob('fast');
    await nextTick();
    const fast = bitmap('fast');
    await decoded('fast', fast);
    const slow = bitmap('slow');
    await decoded('slow', slow);
    expect(state.bitmap.value).toBe(fast);
    expect(slow.close).toHaveBeenCalledOnce();
    image.value = undefined;
    await nextTick();
    expect(state.bitmap.value).toBeUndefined();
    expect(fast.close).toHaveBeenCalledOnce();
    scope.stop();
  });
});
