import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MapCursorCoordinates from '@/features/maps/MapCursorCoordinates.vue';
import type L from 'leaflet';
const { copyToClipboard } = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (_key: string, params: Record<string, string>) => `x: ${params.x}, z: ${params.z}`,
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
const mountReadout = (map: L.Map, floor: string | null) =>
  mount(MapCursorCoordinates, {
    props: { map, crosshairShown: false, hasKeyboardFocus: () => false, mapName: 'Customs', floor },
    global: { stubs: { 'i18n-t': { template: '<span><slot name="key" /></span>' } } },
  });
const valueOf = (wrapper: ReturnType<typeof mountReadout>) =>
  wrapper.find('[data-testid="map-cursor-coordinates-value"]');
describe('MapCursorCoordinates', () => {
  it('shows the game position under the pointer with two decimals', async () => {
    const { container, map } = createMap({ lat: -0.001, lng: 1234.5678 });
    const wrapper = mountReadout(map, null);
    expect(valueOf(wrapper).exists()).toBe(false);
    container.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    await wrapper.vm.$nextTick();
    expect(valueOf(wrapper).text()).toBe('x: 1234.57, z: 0.00');
    expect(wrapper.get('kbd').text()).toBe('C');
    container.dispatchEvent(new MouseEvent('mouseleave'));
    await wrapper.vm.$nextTick();
    expect(valueOf(wrapper).exists()).toBe(false);
  });
  it('copies the map, floor and position so a pasted report names the place', () => {
    const { container, map } = createMap({ lat: 120.014, lng: 112.136 });
    mountReadout(map, '2nd Floor');
    container.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    expect(copyToClipboard).toHaveBeenCalledWith('Customs · 2nd Floor · x: 112.14, z: 120.01');
  });
});
