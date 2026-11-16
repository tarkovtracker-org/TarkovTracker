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
  /** Changes on every keyboard map action, so the crosshair takes over again while shown. */
  keyboardActivity: Readonly<Ref<number>>;
  /** Whether keyboard focus is inside this map, so a press of C belongs to its crosshair. */
  hasKeyboardFocus: () => boolean;
  /** Receives the reading when the user presses C. */
  onCopy: (position: GamePoint) => void;
}
type ScreenPoint = [x: number, y: number];
/** The mouse over the map: where it is on the map, where on screen, and whether a popup covers it. */
interface PointerSample {
  point: ScreenPoint;
  client: ScreenPoint;
  overPopup: boolean;
}
const MAP_VIEW_EVENTS = 'move resize';
/** A popup can appear, close or be panned under a pointer that does not move. */
const POPUP_COVER_EVENTS = 'popupopen popupclose moveend';
/** Popups are cards drawn over the map; the ground they hide is not what the user points at. */
const POPUP_SELECTOR = '.leaflet-popup';
const isInPopup = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(POPUP_SELECTOR) !== null;
/** A closing popup fades out for a moment before Leaflet removes it; it no longer covers. */
const closingPopupOf = (event: L.LeafletEvent): HTMLElement | undefined =>
  event.type === 'popupclose' ? (event as L.PopupEvent).popup.getElement() : undefined;
const isCoveredAt = ([x, y]: ScreenPoint, closing: HTMLElement | undefined): boolean => {
  const cover = document.elementFromPoint(x, y)?.closest(POPUP_SELECTOR);
  return Boolean(cover) && cover !== closing;
};
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
 * keyboard crosshair takes over whenever a key moves or uses it, so keyboard panning reads the map
 * center even with the mouse parked over the map; moving the mouse hands the reading back. Only real mouse
 * input counts: the crosshair's own synthetic hover events never pose as the mouse. Panning and
 * zooming update the value under a still pointer. Pressing C copies the reading of the map under
 * the pointer, or of the focused map's crosshair.
 */
export function useMapCursorCoordinates({
  map,
  crosshairShown,
  keyboardActivity,
  hasKeyboardFocus,
  onCopy,
}: MapCursorCoordinatesOptions): Readonly<Ref<GamePoint | null>> {
  const position = shallowRef<GamePoint | null>(null);
  let pointer: PointerSample | null = null;
  let crosshairFirst = false;
  const readsPointer = (): boolean => pointer !== null && !crosshairFirst;
  const crosshairPoint = (instance: L.Map): ScreenPoint | null => {
    if (!crosshairShown.value) return null;
    const size = instance.getSize();
    return [size.x / 2, size.y / 2];
  };
  const readPoint = (instance: L.Map): ScreenPoint | null => {
    if (!pointer || crosshairFirst) return crosshairPoint(instance);
    return pointer.overPopup ? null : pointer.point;
  };
  const readPosition = (instance: L.Map): GamePoint | null => {
    const point = readPoint(instance);
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
    pointer = {
      point: [point.x, point.y],
      client: [event.clientX, event.clientY],
      overPopup: isInPopup(event.target),
    };
    crosshairFirst = false;
    update();
  };
  const recheckPopupCover = (event: L.LeafletEvent) => {
    if (pointer) pointer.overPopup = isCoveredAt(pointer.client, closingPopupOf(event));
    update();
  };
  watch(
    map,
    (instance, _previous, onCleanup) => {
      clearPointer();
      if (!instance) return;
      const container = instance.getContainer();
      const onMouseMove = (event: MouseEvent) => {
        if (event.isTrusted) trackPointer(instance, event);
      };
      const onMouseLeave = (event: MouseEvent) => {
        if (event.isTrusted) clearPointer();
      };
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseleave', onMouseLeave);
      instance.on(MAP_VIEW_EVENTS, update);
      instance.on(POPUP_COVER_EVENTS, recheckPopupCover);
      onCleanup(() => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseleave', onMouseLeave);
        instance.off(MAP_VIEW_EVENTS, update);
        instance.off(POPUP_COVER_EVENTS, recheckPopupCover);
      });
    },
    { immediate: true }
  );
  watch([crosshairShown, keyboardActivity], ([shown]) => {
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
