import { isExtractRuleData, type ExtractRuleData } from '@/utils/extractRuleData';
import { logger } from '@/utils/logger';
import { tarkovApiFetch } from '@/utils/tarkovApiFetch';
/**
 * Overlay extract rules and cues from `/api/tarkov/extract-requirements`. `null` until the route
 * answers with valid data, and whenever the overlay is unavailable or has not published them:
 * the map then shows each extract's requirements as unknown and omits the source line.
 */
const ruleData = shallowRef<ExtractRuleData | null>(null);
let request: Promise<void> | null = null;
async function loadOverlayRuleData(): Promise<void> {
  try {
    const response = await tarkovApiFetch<{ data: unknown }>('/api/tarkov/extract-requirements');
    if (isExtractRuleData(response?.data)) ruleData.value = response.data;
  } catch (error) {
    // The map never blocks on this request; extracts keep their unknown requirements.
    logger.debug('[ExtractRules] Overlay extract rules unavailable', error);
  }
}
/** The current extract rule data without starting a request; reactive inside computeds. */
export const currentExtractRuleData = (): ExtractRuleData | null => ruleData.value;
/** Extract rule data for the map, requesting the overlay copy once per page load. */
export function useExtractRuleData(): Readonly<Ref<ExtractRuleData | null>> {
  if (import.meta.client && !request) request = loadOverlayRuleData();
  return ruleData;
}
/** Test helper: clear the loaded data and allow a fresh request. */
export function resetExtractRuleData(): void {
  ruleData.value = null;
  request = null;
}
