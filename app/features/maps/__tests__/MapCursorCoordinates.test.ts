import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MapCursorCoordinates from '@/features/maps/MapCursorCoordinates.vue';
import type L from 'leaflet';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params: Record<string, string>) => `${key} x=${params.x} z=${params.z}`,
  }),
}));
/** The Leaflet surface the readout uses; the map shows game (x, z) as (lng, lat). */
const createMap = (latLng: { lat: number; lng: number }) => {
  const container = document.createElement('div');
  const map = {
    getContainer: () => container,
    getSize: () => ({ x: 800, y: 600 }),
    mouseEventToContainerPoint: (event: MouseEvent) => ({ x: event.clientX, y: event.clientY }),
    containerPointToLatLng: () => latLng,
    on: vi.fn(),
    off: vi.fn(),
  };
  return { container, map: map as unknown as L.Map };
};
describe('MapCursorCoordinates', () => {
  it('shows the game position under the pointer with two decimals', async () => {
    const { container, map } = createMap({ lat: -0.001, lng: 1234.5678 });
    const wrapper = mount(MapCursorCoordinates, { props: { map, crosshairShown: false } });
    expect(wrapper.find('[data-testid="map-cursor-coordinates"]').exists()).toBe(false);
    container.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="map-cursor-coordinates"]').text()).toBe(
      'maps.cursor_coordinates x=1234.57 z=0.00'
    );
    container.dispatchEvent(new MouseEvent('mouseleave'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="map-cursor-coordinates"]').exists()).toBe(false);
  });
});
