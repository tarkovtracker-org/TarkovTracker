import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapObjectiveColorControls from '@/features/maps/MapObjectiveColorControls.vue';
import { MAP_OBJECTIVE_PALETTES } from '@/features/maps/utils/objectiveColors';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const mockPreferencesStore = {
  getMapObjectiveColorMode: 'category',
  getMapObjectivePalette: 'okabe_ito',
  setMapObjectiveColorMode: vi.fn(),
  setMapObjectivePalette: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
describe('MapObjectiveColorControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesStore.getMapObjectiveColorMode = 'category';
    mockPreferencesStore.getMapObjectivePalette = 'okabe_ito';
  });
  it('marks the current mode and switches to another one', async () => {
    const wrapper = mount(MapObjectiveColorControls);
    const pressed = (mode: string) =>
      wrapper.get(`[data-testid="map-objective-color-mode-${mode}"]`).attributes('aria-pressed');
    expect([pressed('category'), pressed('task'), pressed('type')]).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(wrapper.get('[data-testid="map-objective-color-mode-hint"]').text()).toBe(
      'settings.interface.maps.objective_colors.mode_hints.category'
    );
    await wrapper.get('[data-testid="map-objective-color-mode-task"]').trigger('click');
    expect(mockPreferencesStore.setMapObjectiveColorMode).toHaveBeenCalledWith('task');
  });
  it('offers the palettes only while chips are colored by quest or type', async () => {
    expect(
      mount(MapObjectiveColorControls).find('[data-testid^="map-objective-palette-"]').exists()
    ).toBe(false);
    mockPreferencesStore.getMapObjectiveColorMode = 'task';
    mockPreferencesStore.getMapObjectivePalette = 'tol_muted';
    const wrapper = mount(MapObjectiveColorControls);
    const muted = wrapper.get('[data-testid="map-objective-palette-tol_muted"]');
    expect(muted.attributes('aria-pressed')).toBe('true');
    expect(muted.findAll('span[style]')).toHaveLength(MAP_OBJECTIVE_PALETTES.tol_muted.length);
    await wrapper.get('[data-testid="map-objective-palette-tol_bright"]').trigger('click');
    expect(mockPreferencesStore.setMapObjectivePalette).toHaveBeenCalledWith('tol_bright');
  });
});
