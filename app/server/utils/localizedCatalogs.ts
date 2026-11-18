import { createError } from 'h3';
import {
  hasGameDataStrings,
  localizeGameData,
  MissingGameDataStringError,
  type GameDataStrings,
} from '@/utils/gameDataStrings';
type CatalogResponse = { data: unknown; release: string | null };
export type CatalogFetcher = (path: string) => Promise<CatalogResponse>;
class IncompatibleCatalogRelease extends Error {}
function assertSameRelease(responses: CatalogResponse[], requireRelease: boolean) {
  const releases = responses.map((response) => response.release);
  const legacy = !requireRelease && releases.every((release) => release === null);
  const same = releases.every((release) => Boolean(release) && release === releases[0]);
  if (legacy || same) return;
  throw new IncompatibleCatalogRelease();
}
async function localizedAttempt<T extends unknown[]>(paths: string[], fetch: CatalogFetcher) {
  const responses = await Promise.all(paths.map(fetch));
  const catalogs = responses.map((response) => response.data) as T;
  const needsStrings = hasGameDataStrings(catalogs);
  assertSameRelease(responses, needsStrings);
  // Prerender during cutover can still receive the preceding localized public API.
  if (!needsStrings) return catalogs;
  const table = await fetch('strings');
  assertSameRelease([...responses, table], true);
  return localizeGameData(catalogs, (table.data as { strings: GameDataStrings }).strings);
}
function retryableSnapshotError(error: unknown) {
  const known = [IncompatibleCatalogRelease, MissingGameDataStringError];
  const { statusCode, status } = Object(error) as { statusCode?: number; status?: number };
  return known.some((ErrorType) => error instanceof ErrorType) || (statusCode ?? status) === 503;
}
async function finalAttempt<T extends unknown[]>(paths: string[], fetch: CatalogFetcher) {
  try {
    return await localizedAttempt<T>(paths, fetch);
  } catch (error) {
    if (!retryableSnapshotError(error)) throw error;
    throw createError({ statusCode: 503, statusMessage: 'Catalog snapshot unavailable' });
  }
}
/** Retry the complete snapshot once; never combine labels from different releases. */
export async function fetchLocalizedCatalogs<T extends unknown[]>(
  paths: string[],
  fetch: CatalogFetcher
): Promise<T> {
  try {
    return await localizedAttempt<T>(paths, fetch);
  } catch (error) {
    if (!retryableSnapshotError(error)) throw error;
  }
  return finalAttempt<T>(paths, fetch);
}
