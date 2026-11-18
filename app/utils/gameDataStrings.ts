/** Translation references are values only. Entity IDs and object keys are never translated. */
export const GAME_DATA_STRING_PREFIX = '@tt:';
export type GameDataStrings = Record<string, string>;
export const isGameDataString = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(GAME_DATA_STRING_PREFIX);
export function localizeGameData<T>(value: T, strings: GameDataStrings): T {
  if (isGameDataString(value)) {
    if (!Object.hasOwn(strings, value)) throw new Error(`Missing game data string ${value}`);
    return strings[value] as T;
  }
  if (Array.isArray(value)) return value.map((entry) => localizeGameData(entry, strings)) as T;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, localizeGameData(entry, strings)])
    ) as T;
  return value;
}
export function collectGameDataStrings(value: unknown, result = new Set<string>()): Set<string> {
  if (isGameDataString(value)) result.add(value);
  else if (value !== null && typeof value === 'object')
    Object.values(value).forEach((entry) => collectGameDataStrings(entry, result));
  return result;
}
export const hasGameDataStrings = (value: unknown): boolean =>
  collectGameDataStrings(value).size > 0;
export const upstreamStringKey = (mode: string, endpoint: string, key: string): string =>
  `${GAME_DATA_STRING_PREFIX}${mode}:${endpoint}:${key}`;
/** The original field is carried with locale-only overrides for deterministic English fallback. */
export const overlayOverrideKey = (mode: string, key: string, fallback: string): string =>
  `@tt:override:${mode}:${encodeURIComponent(key)}:${encodeURIComponent(fallback)}`;
