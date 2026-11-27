import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import MapMarkerColorControls from '@/features/maps/MapMarkerColorControls.vue';
import { MAP_MARKER_COLORS } from '@/utils/theme-colors';
const { setMapMarkerColor } = vi.hoisted(() => ({ setMapMarkerColor: vi.fn() }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getMapMarkerColors: MAP_MARKER_COLORS, setMapMarkerColor }),
}));
it.each([
  [true, 'grid-cols-2', 'w-9'],
  [false, 'sm:grid-cols-2', 'w-11'],
] as const)('edits marker colors in the compact=%s layout', async (compact, grid, width) => {
  setMapMarkerColor.mockClear();
  const wrapper = mount(MapMarkerColorControls, { props: { compact } });
  const input = wrapper.get('input[aria-label="maps.layers.transit"]');
  expect(wrapper.classes()).toContain(grid);
  expect(input.classes()).toContain(width);
  expect(input.element).toHaveProperty('value', MAP_MARKER_COLORS.TRANSIT);
  await input.setValue('#123456');
  expect(setMapMarkerColor).toHaveBeenCalledExactlyOnceWith('TRANSIT', '#123456');
});
