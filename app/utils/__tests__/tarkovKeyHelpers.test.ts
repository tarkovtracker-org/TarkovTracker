import { describe, expect, it } from 'vitest';
import { getKeyPreviewSrc } from '@/utils/tarkovKeyHelpers';
describe('getKeyPreviewSrc', () => {
  it.each(['image8xLink', 'iconLink'] as const)(
    'uses the base item %s when the preset has no image',
    (field) => {
      expect(
        getKeyPreviewSrc({
          id: 'weapon',
          [field]: 'weapon-image',
          properties: { defaultPreset: { id: 'preset' } },
        })
      ).toBe('weapon-image');
    }
  );
});
