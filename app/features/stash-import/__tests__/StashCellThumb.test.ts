// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import StashCellThumb from '@/features/stash-import/StashCellThumb.vue';
it('redraws the crop after native canvas dimensions change, then restores square thumbnails', async () => {
  const frames: number[][] = [];
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    frames.push([this.width, this.height]);
    return { drawImage, clearRect } as unknown as CanvasRenderingContext2D;
  });
  const bitmap = {} as ImageBitmap;
  const wrapper = mount(StashCellThumb, {
    props: { bitmap, cell: { x: 4, y: 8, width: 126, height: 63 }, native: true },
  });
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 4, 8, 126, 63, 0, 0, 126, 63);
  await wrapper.setProps({ cell: { x: 10, y: 20, width: 63, height: 189 } });
  expect(frames.at(-1)).toEqual([63, 189]);
  expect(clearRect).toHaveBeenLastCalledWith(0, 0, 63, 189);
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 10, 20, 63, 189, 0, 0, 63, 189);
  await wrapper.setProps({ native: false });
  expect(frames.at(-1)).toEqual([96, 96]);
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 10, 20, 63, 189, 32, 0, 32, 96);
  await wrapper.setProps({ bitmap: undefined });
  expect(clearRect).toHaveBeenLastCalledWith(0, 0, 96, 96);
  expect(drawImage).toHaveBeenCalledTimes(3);
  wrapper.unmount();
});
it.each([
  [4096, 4096, 1024, 1024],
  [16384, 1024, 1024, 64],
  [1024, 16384, 64, 1024],
])('bounds a large %sx%s manual crop while preserving its aspect ratio', (width, height, w, h) => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const bitmap = {} as ImageBitmap;
  const wrapper = mount(StashCellThumb, {
    props: { bitmap, native: true, cell: { x: 0, y: 0, width, height } },
  });
  expect(wrapper.attributes('width')).toBe(String(w));
  expect(wrapper.attributes('height')).toBe(String(h));
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, width, height, 0, 0, w, h);
  wrapper.unmount();
});
