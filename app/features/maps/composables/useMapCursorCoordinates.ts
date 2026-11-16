import { latLngToGame } from '@/utils/mapCoordinates';
import type { Ref } from '#imports';
import type L from 'leaflet';
interface MapCursorCoordinatesOptions {
  /** The live map; the listeners move to a rebuilt map and leave with a destroyed one. */
  map: Readonly<Ref<L.Map | null>>;
  /** True while the keyboard crosshair is drawn at the map center. */
  crosshairShown: Readonly<Ref<boolean>>;
}
type GamePoint = { x: number; z: number };
type ContainerPoint = [x: number, y: number];
const MAP_VIEW_EVENTS = 'move resize';
/**
 * Game X and Z under the mouse pointer, for debugging and for reporting map data by position.
 *
 * The keyboard crosshair takes over when it appears, so keyboard panning reads the map center
 * even with the mouse parked over the map; moving the mouse hands the reading back. Panning and
 * zooming update the value under a still pointer. With neither a pointer over the map nor a
 * crosshair, the value is null.
 */
export function useMapCursorCoordinates({
  map,
  crosshairShown,
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
  const readPosition = (instance: L.Map): GamePoint | null => {
    const point = crosshairFirst || !pointer ? crosshairPoint(instance) : pointer;
    return point ? latLngToGame(instance.containerPointToLatLng(point)) : null;
  };
  const update = () => {
    position.value = map.value ? readPosition(map.value) : null;
  };
  const clearPointer = () => {
    pointer = null;
    update();
  };
  watch(
    map,
    (instance, _previous, onCleanup) => {
      clearPointer();
      if (!instance) return;
      const container = instance.getContainer();
      const onMouseMove = (event: MouseEvent) => {
        const point = instance.mouseEventToContainerPoint(event);
        pointer = [point.x, point.y];
        crosshairFirst = false;
        update();
      };
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
  return position;
}
