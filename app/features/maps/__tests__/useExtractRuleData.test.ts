import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_EXTRACT_RULE_DATA,
  currentExtractRuleData,
  resetExtractRuleData,
  useExtractRuleData,
} from '@/features/maps/composables/useExtractRuleData';
import { isCoopExtract } from '@/features/maps/composables/useLeafletMapControls';
import { isExtractRuleData } from '@/utils/extractRuleData';
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
  it('ships a valid bundled copy in the overlay format', () => {
    expect(isExtractRuleData(BUNDLED_EXTRACT_RULE_DATA)).toBe(true);
    expect(currentExtractRuleData()).toBe(BUNDLED_EXTRACT_RULE_DATA);
  });
  it('requests the overlay copy once and replaces the bundled data with it', async () => {
    mockTarkovApiFetch.mockResolvedValue({ data: overlayData });
    const data = useExtractRuleData();
    useExtractRuleData();
    await flush();
    expect(mockTarkovApiFetch).toHaveBeenCalledTimes(1);
    expect(mockTarkovApiFetch).toHaveBeenCalledWith('/api/tarkov/extract-requirements');
    expect(data.value).toEqual(overlayData);
    // Co-op classification follows the current data, not only the bundled copy.
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
  ])('keeps the bundled data for %s', async (_case, response) => {
    mockTarkovApiFetch.mockImplementation(response);
    const data = useExtractRuleData();
    await flush();
    expect(data.value).toBe(BUNDLED_EXTRACT_RULE_DATA);
    expect(isCoopExtract({ id: 'new-coop', name: 'Gate' })).toBe(false);
  });
});
