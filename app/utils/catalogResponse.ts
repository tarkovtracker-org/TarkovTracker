import { tarkovApiFetch, type TarkovApiRequestOptions } from '@/utils/tarkovApiFetch';
type CatalogResponseSnapshot = {
  status: string | null;
  release: string | null;
  purgeGeneration: number;
};
const snapshots = new WeakMap<object, CatalogResponseSnapshot>();
/** A PRECOMPUTE response consulted the active release pointer during this request. */
export const catalogSnapshotAfterPurge = (
  payload: object,
  purgeTime: number
): boolean | undefined => {
  const snapshot = snapshots.get(toRaw(payload));
  if (!snapshot) return undefined;
  const release = Number(snapshot.release);
  return [
    snapshot.status === 'PRECOMPUTE',
    Number.isSafeInteger(release),
    release > 0,
    snapshot.purgeGeneration === purgeTime,
  ].every(Boolean);
};
export async function fetchTarkovCatalog<T>(
  endpoint: string,
  options: TarkovApiRequestOptions = {},
  purgeGeneration = 0
): Promise<T> {
  let snapshot: CatalogResponseSnapshot | undefined;
  const payload = await tarkovApiFetch<T>(endpoint, {
    ...options,
    onResponse: async ({ response }) => {
      snapshot = {
        status: response.headers.get('x-cache-status'),
        release: response.headers.get('x-catalog-release'),
        purgeGeneration,
      };
      await options.onResponse?.({ response });
    },
  });
  if (snapshot && payload !== null && typeof payload === 'object')
    snapshots.set(toRaw(payload), snapshot);
  return payload;
}
