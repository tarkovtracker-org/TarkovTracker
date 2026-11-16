import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue';
import { useMapCursorCoordinates } from '@/features/maps/composables/useMapCursorCoordinates';
import { gameToLatLng, getLeafletMapOptions, type MapRenderConfig } from '@/utils/mapCoordinates';
import type L from 'leaflet';
const customs: MapRenderConfig = {
  file: 'Customs.svg',
  floors: ['Ground_Level'],
  defaultFloor: 'Ground_Level',
  coordinateRotation: 180,
  transform: [0.239, 168.65, 0.239, 136.35],
  bounds: [
    [698, -307],
    [-372, 237],
  ],
};
const factory: MapRenderConfig = {
  ...customs,
  coordinateRotation: 90,
  transform: [1.629, 119.9, 1.629, 139.3],
};
let scope: EffectScope | null = null;
const maps: L.Map[] = [];
const loadLeaflet = async () => {
  const leafletModule = await import('leaflet');
  return leafletModule.default || leafletModule;
};
const createMap = async (config: MapRenderConfig): Promise<L.Map> => {
  const leaflet = await loadLeaflet();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = leaflet.map(container, getLeafletMapOptions(leaflet, config));
  map.setView([0, 0], 3, { animate: false });
  maps.push(map);
  return map;
};
const track = (map: L.Map | null) => {
  const mapRef = shallowRef(map);
  const crosshairShown = ref(false);
  const focus = { inside: false };
  const onCopy = vi.fn();
  scope = effectScope();
  const position = scope.run(() =>
    useMapCursorCoordinates({
      map: mapRef,
      crosshairShown,
      hasKeyboardFocus: () => focus.inside,
      onCopy,
    })
  )!;
  return { mapRef, crosshairShown, focus, onCopy, position };
};
const pressKey = (init: KeyboardEventInit, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
/** Screen point of a game position without the whole-pixel rounding Leaflet applies to markers. */
const exactContainerPoint = (map: L.Map, x: number, z: number) =>
  map.layerPointToContainerPoint(map.project(gameToLatLng(x, z)).subtract(map.getPixelOrigin()));
/** Moves the mouse over the screen point that shows a game position, above `target` if given. */
const hoverGamePoint = (map: L.Map, x: number, z: number, target?: Element) => {
  const point = exactContainerPoint(map, x, z);
  (target ?? map.getContainer()).dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX: point.x, clientY: point.y })
  );
};
const expectPosition = (actual: { x: number; z: number } | null, x: number, z: number) => {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(x, 6);
  expect(actual!.z).toBeCloseTo(z, 6);
};
describe('useMapCursorCoordinates', () => {
  afterEach(() => {
    scope?.stop();
    scope = null;
    maps.splice(0).forEach((map) => {
      map.getContainer().remove();
      map.remove();
    });
  });
  it.each([
    ['Customs (180°)', customs],
    ['Factory (90°)', factory],
  ])('reads back the game position under the mouse on %s', async (_name, config) => {
    const map = await createMap(config);
    const { position } = track(map);
    expect(position.value).toBeNull();
    hoverGamePoint(map, 123.45, -67.89);
    expectPosition(position.value, 123.45, -67.89);
  });
  it('follows the map under a still pointer and clears when the pointer leaves', async () => {
    const map = await createMap(customs);
    const { position } = track(map);
    hoverGamePoint(map, 10, 20);
    const pointer = exactContainerPoint(map, 10, 20);
    map.panBy([40, -25], { animate: false });
    const moved = map.containerPointToLatLng(pointer);
    expectPosition(position.value, moved.lng, moved.lat);
    expect(position.value!.x).not.toBeCloseTo(10, 2);
    map.getContainer().dispatchEvent(new MouseEvent('mouseleave'));
    expect(position.value).toBeNull();
  });
  it('reads the keyboard crosshair when it appears and the mouse once it moves', async () => {
    const map = await createMap(customs);
    const { crosshairShown, position } = track(map);
    hoverGamePoint(map, 10, 20);
    crosshairShown.value = true;
    await nextTick();
    const size = map.getSize();
    const center = map.containerPointToLatLng([size.x / 2, size.y / 2]);
    expectPosition(position.value, center.lng, center.lat);
    hoverGamePoint(map, -30, 40);
    expectPosition(position.value, -30, 40);
    // The crosshair still answers once the mouse leaves; hiding it clears the reading.
    map.getContainer().dispatchEvent(new MouseEvent('mouseleave'));
    expectPosition(position.value, center.lng, center.lat);
    crosshairShown.value = false;
    await nextTick();
    expect(position.value).toBeNull();
  });
  it('reads the ground under a pin and clears over a popup card', async () => {
    const leaflet = await loadLeaflet();
    const map = await createMap(customs);
    const { position } = track(map);
    const pin = leaflet
      .marker(gameToLatLng(10, 20), {
        icon: leaflet.divIcon({ html: '<span class="pin-head"></span>', iconSize: [36, 36] }),
      })
      .addTo(map);
    const pinHead = pin.getElement()!.querySelector('.pin-head')!;
    // The pin covers several meters; each point on it reads its own ground, not the pin position.
    hoverGamePoint(map, 12.5, 21, pinHead);
    expectPosition(position.value, 12.5, 21);
    hoverGamePoint(map, 9, 18.25, pinHead);
    expectPosition(position.value, 9, 18.25);
    const popup = leaflet
      .popup()
      .setLatLng(gameToLatLng(10, 20))
      .setContent('<button type="button">Details</button>')
      .openOn(map);
    hoverGamePoint(map, 10, 20, popup.getElement()!.querySelector('button')!);
    expect(position.value).toBeNull();
    hoverGamePoint(map, 30, 40);
    expectPosition(position.value, 30, 40);
  });
  it('copies the reading with C, leaving typing and modified keys alone', async () => {
    const map = await createMap(customs);
    const { onCopy } = track(map);
    expect(pressKey({ key: 'c' }).defaultPrevented).toBe(false);
    hoverGamePoint(map, 10, 20);
    const input = document.body.appendChild(document.createElement('input'));
    pressKey({ key: 'c', ctrlKey: true });
    pressKey({ key: 'c', repeat: true });
    pressKey({ key: 'c' }, input);
    input.remove();
    expect(onCopy).not.toHaveBeenCalled();
    expect(pressKey({ key: 'C', shiftKey: true }).defaultPrevented).toBe(true);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expectPosition(onCopy.mock.calls[0]![0], 10, 20);
  });
  it('copies the crosshair reading only while its map has keyboard focus', async () => {
    const map = await createMap(customs);
    const { crosshairShown, focus, onCopy } = track(map);
    crosshairShown.value = true;
    await nextTick();
    pressKey({ key: 'c' });
    expect(onCopy).not.toHaveBeenCalled();
    focus.inside = true;
    pressKey({ key: 'c' });
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
  it('moves its listeners to a rebuilt map and drops them with a destroyed one', async () => {
    const first = await createMap(customs);
    const second = await createMap(factory);
    const { mapRef, position } = track(first);
    hoverGamePoint(first, 1, 2);
    mapRef.value = second;
    await nextTick();
    expect(position.value).toBeNull();
    hoverGamePoint(first, 3, 4);
    expect(position.value).toBeNull();
    hoverGamePoint(second, 5, 6);
    expectPosition(position.value, 5, 6);
    mapRef.value = null;
    await nextTick();
    expect(position.value).toBeNull();
    hoverGamePoint(second, 7, 8);
    expect(position.value).toBeNull();
  });
});
