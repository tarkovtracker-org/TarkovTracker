/** Shared controls for neutral catalog releases and whole English import snapshots. */
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
export const PRECOMPUTED_TTL_SECONDS = 7 * 24 * 60 * 60;
export type KvWriter = {
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};
export type PrecomputeFilter = {
  gameMode?: string;
  lang?: string;
};
/**
 * Returns an error message when a filter value matches no supported
 * combination, so the runner can reject it with a non-zero exit instead of
 * silently completing a no-op run. Returns null when the filter is valid.
 */
export function validatePrecomputeFilter(filter: PrecomputeFilter): string | null {
  if (filter.lang !== undefined && filter.lang !== 'en')
    return `Unsupported lang "${filter.lang}". Filtered runs refresh English imports only. Omit both filters to publish all languages.`;
  if (
    filter.gameMode !== undefined &&
    !(VALID_GAME_MODES as readonly string[]).includes(filter.gameMode)
  ) {
    return `Unsupported gameMode "${filter.gameMode}". Supported: ${VALID_GAME_MODES.join(', ')}`;
  }
  return null;
}
