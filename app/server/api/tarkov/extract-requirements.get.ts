import {
  isExtractCuesSection,
  isExtractRequirementsSection,
  type ExtractRuleData,
} from '@/utils/extractRuleData';
import type { OverlayData } from '~/server/utils/overlayTypes';
import { shouldBypassCache } from '~/server/utils/edgeCache';
import { fetchOverlay } from '~/server/utils/overlay';
import { setOverlayResponseHeaders } from '~/server/utils/overlayResponseHeaders';
/**
 * Overlay extract rules and curated cues for every mode. Both sections are needed together: a
 * cue only means something beside its extract's rules. `data` is null until the overlay
 * publishes valid sections, so the client keeps its bundled fallback.
 */
const projectExtractRuleData = (overlay: OverlayData): ExtractRuleData | null =>
  isExtractRequirementsSection(overlay.extractRequirements) &&
  isExtractCuesSection(overlay.extractCues)
    ? { requirements: overlay.extractRequirements, cues: overlay.extractCues }
    : null;
export default defineEventHandler(async (event) => {
  try {
    const { overlay, meta } = await fetchOverlay(shouldBypassCache(event));
    if (!overlay)
      throw createError({ statusCode: 503, statusMessage: 'Extract requirements unavailable' });
    const response = { data: projectExtractRuleData(overlay), dataOverlay: meta };
    // The overlay module cache bounds freshness; browsers revalidate so corrections show promptly.
    setHeader(event, 'Cache-Control', 'no-cache');
    setOverlayResponseHeaders(event, response);
    return response;
  } catch (error) {
    setHeader(event, 'Cache-Control', 'no-store');
    throw error;
  }
});
