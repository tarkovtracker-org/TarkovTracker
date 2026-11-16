import { useEventListener } from '@vueuse/core';
import { isEditableTarget } from '@/utils/editableTarget';
import { latLngToGame } from '@/utils/mapCoordinates';
import type { Ref } from '#imports';
import type L from 'leaflet';
export type GamePoint = { x: number; z: number };
interface MapCursorCoordinatesOptions {
  /** The live map; the listeners move to a rebuilt map and leave with a destroyed one. */
  map: Readonly<Ref<L.Map | null>>;
  /** True while the keyboard crosshair is drawn at the map center. */
  crosshairShown: Readonly<Ref<boolean>>;
  /** Whether keyboard focus is inside this map, so a press of C belongs to its crosshair. */
  hasKeyboardFocus: () => boolean;
  /** Receives the reading when the user presses C. */
  onCopy: (position: GamePoint) => void;
}
type ContainerPoint = [x: number, y: number];
const MAP_VIEW_EVENTS = 'move resize';
/** Popups are cards drawn over the map; the ground they hide is not what the user points at. */
const POPUP_SELECTOR = '.leaflet-popup';
const isOverPopup = (event: MouseEvent): boolean =>
  event.target instanceof Element && event.target.closest(POPUP_SELECTOR) !== null;
const isCKey = (event: KeyboardEvent): boolean =>
  event.key.toLowerCase() === 'c' || event.code === 'KeyC';
/** Ctrl+C and friends keep their usual meaning, and a held key copies once. */
const isPlainPress = (event: KeyboardEvent): boolean =>
  !(event.repeat || event.ctrlKey || event.metaKey || event.altKey);
const isCopyShortcut = (event: KeyboardEvent): boolean =>
  isCKey(event) && isPlainPress(event) && !isEditableTarget(event.target);
/**
 * Game X and Z under the mouse pointer, for debugging and for reporting map data by position.
 *
 * Markers and pins do not interrupt the reading: it always names the ground under the pointer.
 * Popups and the map's own controls are not the map, so the reading clears over them. The
 * keyboard crosshair takes over when it appears, so keyboard panning reads the map center even
 * with the mouse parked over the map; moving the mouse hands the reading back. Panning and
 * zooming update the value under a still pointer. Pressing C copies the reading of the map under
 * the pointer, or of the focused map's crosshair.
 */
export function useMapCursorCoordinates({
  map,
  crosshairShown,
  hasKeyboardFocus,
  onCopy,
}: MapCursorCoordinatesOptions): Readonly<Ref<GamePoint | null>> {
  const position = shallowRef<GamePoint | null>(null);
  /** Container point of the mouse while it is over the map. */
  let pointer: ContainerPoint | null = null;
  let crosshairFirst = false;
  const crosshairPoint = (instance: L.Map): ContainerPoint | null => {
    if (!crosshairShown.value) return null;
    const size = instance.getSize();
    return [size.x / 2, size.y / 2];
  };
  const readsPointer = (): boolean => pointer !== null && !crosshairFirst;
  const readPosition = (instance: L.Map): GamePoint | null => {
    const point = readsPointer() ? pointer : crosshairPoint(instance);
    return point ? latLngToGame(instance.containerPointToLatLng(point)) : null;
  };
  const update = () => {
    position.value = map.value ? readPosition(map.value) : null;
  };
  const clearPointer = () => {
    pointer = null;
    update();
  };
  const trackPointer = (instance: L.Map, event: MouseEvent) => {
    const point = instance.mouseEventToContainerPoint(event);
    pointer = [point.x, point.y];
    crosshairFirst = false;
    update();
  };
  watch(
    map,
    (instance, _previous, onCleanup) => {
      clearPointer();
      if (!instance) return;
      const container = instance.getContainer();
      const onMouseMove = (event: MouseEvent) =>
        isOverPopup(event) ? clearPointer() : trackPointer(instance, event);
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseleave', clearPointer);
      instance.on(MAP_VIEW_EVENTS, update);
      onCleanup(() => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseleave', clearPointer);
        instance.off(MAP_VIEW_EVENTS, update);
      });
    },
    { immediate: true }
  );
  watch(crosshairShown, (shown) => {
    crosshairFirst = shown;
    update();
  });
  /** Only one map is under the pointer; a crosshair answers only while its map has focus. */
  const ownsCopy = (): boolean => readsPointer() || hasKeyboardFocus();
  const onKeydown = (event: KeyboardEvent) => {
    if (!position.value || !isCopyShortcut(event) || !ownsCopy()) return;
    event.preventDefault();
    onCopy(position.value);
  };
  useEventListener('keydown', onKeydown);
  return position;
}
