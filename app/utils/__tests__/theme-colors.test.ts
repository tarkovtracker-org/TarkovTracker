import { describe, expect, it } from 'vitest';
import {
  getMapColorOptions,
  LEGACY_MAP_MARKER_COLORS,
  MAP_MARKER_COLORS,
  migrateLegacyMapMarkerColors,
} from '@/utils/theme-colors';
const t = (key: string) => key;
describe('theme-colors', () => {
  it('defines a distinct PINNED_OBJECTIVE color separate from SELECTED', () => {
    expect(MAP_MARKER_COLORS.PINNED_OBJECTIVE).toBe('#7c3bed');
    // Must be a distinct key from SELECTED so the popup-pin behaviour
    // (attachHoverPinPopup / setLayerSelected) stays unambiguous.
    expect(MAP_MARKER_COLORS.PINNED_OBJECTIVE).not.toBe(undefined);
    expect('SELECTED' in MAP_MARKER_COLORS).toBe(true);
  });
  it('includes PINNED_OBJECTIVE in getMapColorOptions with the expected label key', () => {
    const options = getMapColorOptions(t);
    const pinnedOption = options.find((option) => option.key === 'PINNED_OBJECTIVE');
    expect(pinnedOption).toBeDefined();
    expect(pinnedOption?.label).toBe('settings.interface.maps.colors.pinned_objective');
  });
  it('places PINNED_OBJECTIVE immediately after SELF_OBJECTIVE in getMapColorOptions', () => {
    const options = getMapColorOptions(t);
    const selfIndex = options.findIndex((option) => option.key === 'SELF_OBJECTIVE');
    const pinnedIndex = options.findIndex((option) => option.key === 'PINNED_OBJECTIVE');
    expect(selfIndex).toBeGreaterThanOrEqual(0);
    expect(pinnedIndex).toBe(selfIndex + 1);
  });
  it('still migrates a stored legacy object that lacks the new PINNED_OBJECTIVE key (regression guard)', () => {
    // Simulates a user's persisted mapMarkerColors from before this feature shipped:
    // it has exactly the legacy default values, but no PINNED_OBJECTIVE key at all
    // (that key did not exist yet when the value was persisted).
    const legacyStored: Record<string, string> = { ...LEGACY_MAP_MARKER_COLORS };
    delete legacyStored.PINNED_OBJECTIVE;
    expect('PINNED_OBJECTIVE' in legacyStored).toBe(false);
    const migrated = migrateLegacyMapMarkerColors(legacyStored);
    expect(migrated).not.toBeNull();
    expect(migrated).toEqual(MAP_MARKER_COLORS);
    expect(migrated?.PINNED_OBJECTIVE).toBe(MAP_MARKER_COLORS.PINNED_OBJECTIVE);
  });
  it('does not migrate when a legacy-shaped object has an unrelated modification', () => {
    const tampered: Record<string, string> = {
      ...LEGACY_MAP_MARKER_COLORS,
      SELF_OBJECTIVE: '#123456',
    };
    expect(migrateLegacyMapMarkerColors(tampered)).toBeNull();
  });
});
