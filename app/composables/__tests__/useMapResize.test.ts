import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useMapResize } from '@/composables/useMapResize';
const setWindowHeight = (height: number) => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
};
const setup = (options?: Parameters<typeof useMapResize>[0]) => {
  const scope = effectScope();
  const result = scope.run(() => useMapResize(options))!;
  return { scope, ...result };
};
describe('useMapResize', () => {
  beforeEach(() => {
    localStorage.clear();
    setWindowHeight(1000);
  });
  afterEach(() => {
    localStorage.clear();
  });
  it('follows the window height until the user resizes', async () => {
    const { scope, mapHeight, isAutoHeight } = setup();
    expect(isAutoHeight.value).toBe(true);
    expect(mapHeight.value).toBe(750);
    setWindowHeight(800);
    await nextTick();
    expect(mapHeight.value).toBe(600);
    expect(localStorage.getItem('tasks_map_height')).toBeNull();
    scope.stop();
  });
  it('treats the legacy stored default as never resized', () => {
    localStorage.setItem('tasks_map_height', '520');
    const { scope, mapHeight, isAutoHeight } = setup();
    expect(isAutoHeight.value).toBe(true);
    expect(mapHeight.value).toBe(750);
    scope.stop();
  });
  it('keeps a chosen height and can reset to the automatic size', async () => {
    localStorage.setItem('tasks_map_height', '600');
    const { scope, mapHeight, isAutoHeight, resetHeight } = setup();
    expect(isAutoHeight.value).toBe(false);
    expect(mapHeight.value).toBe(600);
    mapHeight.value = 700;
    await nextTick();
    expect(localStorage.getItem('tasks_map_height')).toBe('700');
    resetHeight();
    await nextTick();
    expect(isAutoHeight.value).toBe(true);
    expect(mapHeight.value).toBe(750);
    expect(localStorage.getItem('tasks_map_height')).toBeNull();
    scope.stop();
  });
  it('uses a fixed default height when one is given', () => {
    localStorage.setItem('tasks_graph_height', '620');
    const { scope, mapHeight, isAutoHeight } = setup({
      defaultHeight: 620,
      storageKey: 'tasks_graph_height',
    });
    expect(isAutoHeight.value).toBe(true);
    expect(mapHeight.value).toBe(620);
    scope.stop();
  });
  it('clamps chosen heights to the window-based maximum', () => {
    const { scope, mapHeight, mapHeightMax } = setup();
    mapHeight.value = 5000;
    expect(mapHeight.value).toBe(mapHeightMax.value);
    expect(mapHeightMax.value).toBe(850);
    mapHeight.value = 10;
    expect(mapHeight.value).toBe(320);
    scope.stop();
  });
});
