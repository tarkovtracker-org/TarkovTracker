/**
 * Centralized cache TTL configuration for Tarkov API endpoints
 * All values are in seconds
 */
import { logger } from './logger';
// 12 hours - for data that changes with game updates
export const CACHE_TTL_DEFAULT = 43200 as const;
// 24 hours - for relatively static data like items catalog
export const CACHE_TTL_EXTENDED = 86400 as const;
// Valid game modes for API requests
export const VALID_GAME_MODES = ['regular', 'pve', 'pvp-season'] as const;
export type ValidGameMode = (typeof VALID_GAME_MODES)[number];
const isValidGameMode = (value: string): value is ValidGameMode =>
  (VALID_GAME_MODES as ReadonlyArray<string>).includes(value);
/**
 * Validates and returns a valid game mode, defaulting to 'regular'
 */
export function validateGameMode(gameMode: unknown): ValidGameMode {
  const rawValue = Array.isArray(gameMode) ? gameMode[0] : gameMode;
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : undefined;
  // Log early if input is empty, whitespace-only, or undefined before validation
  if (trimmed === '' || trimmed === undefined) {
    logger.debug(
      '[TarkovCache] Empty, whitespace-only, or undefined game mode input, falling back to regular',
      {
        gameMode,
        rawValue,
        trimmed,
      }
    );
  }
  const normalized = trimmed ? trimmed.toLowerCase() : 'regular';
  if (isValidGameMode(normalized)) {
    return normalized;
  }
  logger.debug('[TarkovCache] Invalid game mode, falling back to regular', {
    input: gameMode,
    trimmed,
    normalized,
  });
  return 'regular';
}
