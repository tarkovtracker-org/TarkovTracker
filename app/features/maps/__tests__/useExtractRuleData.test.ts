import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentExtractRuleData,
  resetExtractRuleData,
  useExtractRuleData,
} from '@/features/maps/composables/useExtractRuleData';
import { isCoopExtract } from '@/features/maps/composables/useLeafletMapControls';
const { mockTarkovApiFetch } = vi.hoisted(() => ({ mockTarkovApiFetch: vi.fn() }));
vi.mock('@/utils/tarkovApiFetch', () => ({ tarkovApiFetch: mockTarkovApiFetch }));
const overlayData = {
  requirements: {
    sources: { regular: { clientBuild: '1.3.0.2.49000', definitionsSha256: 'b'.repeat(64) } },
    maps: { map: { 'new-coop': { name: 'new_coop', rules: [{ type: 'coop' }] } } },
  },
  cues: {},
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  resetExtractRuleData();
  mockTarkovApiFetch.mockReset();
});
describe('extract rule data', () => {
  it('starts with no rule data instead of a bundled copy', () => {
    expect(currentExtractRuleData()).toBeNull();
    // Before the rules load, co-op classification falls back to the extract name.
    expect(isCoopExtract({ id: 'new-coop', name: 'Gate' })).toBe(false);
    expect(isCoopExtract({ id: 'new-coop', name: 'Scav Co-Op Exfil' })).toBe(true);
  });
  it('requests the overlay copy once and uses it', async () => {
    mockTarkovApiFetch.mockResolvedValue({ data: overlayData });
    const data = useExtractRuleData();
    useExtractRuleData();
    await flush();
    expect(mockTarkovApiFetch).toHaveBeenCalledTimes(1);
    expect(mockTarkovApiFetch).toHaveBeenCalledWith('/api/tarkov/extract-requirements');
    expect(data.value).toEqual(overlayData);
    // Co-op classification follows the loaded data.
    expect(isCoopExtract({ id: 'new-coop', name: 'Gate' })).toBe(true);
  });
  it.each([
    ['an unpublished overlay section', async () => ({ data: null })],
    ['a malformed overlay payload', async () => ({ data: { requirements: {}, cues: {} } })],
    [
      'an unavailable overlay',
      async () => {
        throw new Error('503');
      },
    ],
  ])('leaves the rule data empty for %s', async (_case, response) => {
    mockTarkovApiFetch.mockImplementation(response);
    const data = useExtractRuleData();
    await flush();
    expect(mockTarkovApiFetch).toHaveBeenCalledTimes(1);
    expect(data.value).toBeNull();
    expect(isCoopExtract({ id: 'new-coop', name: 'Gate' })).toBe(false);
  });
  it('classifies co-op extracts per game mode from the same rules the details show', async () => {
    mockTarkovApiFetch.mockResolvedValue({
      data: {
        requirements: {
          sources: {
            regular: overlayData.requirements.sources.regular,
            'pvp-season': overlayData.requirements.sources.regular,
          },
          maps: { map: { split: { name: 'split', pvp: [{ type: 'coop' }], seasonal: [] } } },
        },
        cues: {},
      },
    });
    useExtractRuleData();
    await flush();
    const extract = { id: 'split', name: 'Gate' };
    expect(isCoopExtract(extract, 'pvp')).toBe(true);
    expect(isCoopExtract(extract, 'pve')).toBe(true);
    expect(isCoopExtract(extract, 'seasonal')).toBe(false);
    // The name fallback still covers extracts the data does not describe.
    expect(isCoopExtract({ id: 'other', name: 'Scav Co-Op Exfil' }, 'seasonal')).toBe(true);
  });
});
