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
const press = (key: string) => new KeyboardEvent('keydown', { key, cancelable: true });
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
    expect(localStorage.getItem('tasks_map_height_choice')).toBeNull();
    scope.stop();
  });
  it('drops the legacy stored default once and keeps other legacy choices', () => {
    localStorage.setItem('tasks_map_height', '520');
    const untouched = setup();
    expect(untouched.isAutoHeight.value).toBe(true);
    expect(untouched.mapHeight.value).toBe(750);
    expect(localStorage.getItem('tasks_map_height')).toBeNull();
    untouched.scope.stop();
    localStorage.setItem('tasks_map_height', '600');
    const chosen = setup();
    expect(chosen.isAutoHeight.value).toBe(false);
    expect(chosen.mapHeight.value).toBe(600);
    expect(localStorage.getItem('tasks_map_height')).toBeNull();
    expect(localStorage.getItem('tasks_map_height_choice')).toBe('600');
    chosen.scope.stop();
  });
  it('remembers a chosen height of exactly the old default', async () => {
    const first = setup();
    first.mapHeight.value = 520;
    await nextTick();
    first.scope.stop();
    const second = setup();
    expect(second.isAutoHeight.value).toBe(false);
    expect(second.mapHeight.value).toBe(520);
    second.scope.stop();
  });
  it('resets to the automatic size from code and with the Enter key', async () => {
    const { scope, mapHeight, isAutoHeight, resetHeight, onResizeKeydown } = setup();
    mapHeight.value = 700;
    await nextTick();
    expect(localStorage.getItem('tasks_map_height_choice')).toBe('700');
    resetHeight();
    await nextTick();
    expect(isAutoHeight.value).toBe(true);
    expect(mapHeight.value).toBe(750);
    const arrow = press('ArrowDown');
    onResizeKeydown(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    expect(mapHeight.value).toBe(774);
    const enter = press('Enter');
    onResizeKeydown(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(isAutoHeight.value).toBe(true);
    const other = press('a');
    onResizeKeydown(other);
    expect(other.defaultPrevented).toBe(false);
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
