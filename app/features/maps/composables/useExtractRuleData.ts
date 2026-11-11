import bundledCues from '@/data/extractCues.json';
import bundledRequirements from '@/data/extractRequirements.json';
import { isExtractRuleData, type ExtractRuleData } from '@/utils/extractRuleData';
import { logger } from '@/utils/logger';
import { tarkovApiFetch } from '@/utils/tarkovApiFetch';
/**
 * Bundled copy of the overlay's extract sections, used until `/api/tarkov/extract-requirements`
 * answers (and whenever the overlay is unavailable or has not published them yet).
 */
export const BUNDLED_EXTRACT_RULE_DATA = {
  requirements: bundledRequirements,
  cues: bundledCues,
} as ExtractRuleData;
const ruleData = shallowRef<ExtractRuleData>(BUNDLED_EXTRACT_RULE_DATA);
let request: Promise<void> | null = null;
async function loadOverlayRuleData(): Promise<void> {
  try {
    const response = await tarkovApiFetch<{ data: unknown }>('/api/tarkov/extract-requirements');
    if (isExtractRuleData(response?.data)) ruleData.value = response.data;
  } catch (error) {
    // The bundled rules stay in place; the map never blocks on this request.
    logger.debug('[ExtractRules] Overlay extract rules unavailable, using bundled copy', error);
  }
}
/** The current extract rule data without starting a request; reactive inside computeds. */
export const currentExtractRuleData = (): ExtractRuleData => ruleData.value;
/** Extract rule data for the map, requesting the overlay copy once per page load. */
export function useExtractRuleData(): Readonly<Ref<ExtractRuleData>> {
  if (import.meta.client && !request) request = loadOverlayRuleData();
  return ruleData;
}
/** Test helper: restore the bundled data and allow a fresh request. */
export function resetExtractRuleData(): void {
  ruleData.value = BUNDLED_EXTRACT_RULE_DATA;
  request = null;
}
