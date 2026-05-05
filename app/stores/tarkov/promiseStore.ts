export interface PromiseStore {
  readonly bootstrapPromise: Promise<void> | null;
  readonly tasksCorePromise: Promise<void> | null;
  readonly hideoutPromise: Promise<void> | null;
  readonly itemsFullPromise: Promise<void> | null;
  readonly itemsLitePromise: Promise<void> | null;
  readonly mapSpawnsPromise: Promise<void> | null;
  readonly objectiveModeCountDifferencesPromise: Promise<void> | null;
  readonly taskObjectivesPromise: Promise<void> | null;
  readonly taskRewardsPromise: Promise<void> | null;
  readonly prestigePromise: Promise<void> | null;
  readonly editionsPromise: Promise<void> | null;
  readonly initPromise: Promise<void> | null;
  readonly isInitializing: boolean;
}
export type PromiseKey = {
  [K in keyof PromiseStore]: PromiseStore[K] extends Promise<void> | null ? K : never;
}[keyof PromiseStore];
export type PromiseRequestContext = {
  requestIds: Partial<Record<PromiseKey, symbol>>;
  requestKeys: Partial<Record<PromiseKey, string>>;
};
type MutablePromiseStore = {
  -readonly [K in keyof PromiseStore]: PromiseStore[K];
};
const storePromises = new WeakMap<object, MutablePromiseStore>();
const storePromiseRequestKeys = new WeakMap<object, Partial<Record<PromiseKey, string>>>();
const storePromiseRequestIds = new WeakMap<object, Partial<Record<PromiseKey, symbol>>>();
export function getPromiseStore(storeInstance: object): MutablePromiseStore {
  let promises = storePromises.get(storeInstance);
  if (!promises) {
    promises = {
      bootstrapPromise: null,
      tasksCorePromise: null,
      hideoutPromise: null,
      itemsFullPromise: null,
      itemsLitePromise: null,
      mapSpawnsPromise: null,
      objectiveModeCountDifferencesPromise: null,
      taskObjectivesPromise: null,
      taskRewardsPromise: null,
      prestigePromise: null,
      editionsPromise: null,
      initPromise: null,
      isInitializing: false,
    };
    storePromises.set(storeInstance, promises);
  }
  return promises;
}
export function getPromiseRequestKeyStore(
  storeInstance: object
): Partial<Record<PromiseKey, string>> {
  let keys = storePromiseRequestKeys.get(storeInstance);
  if (!keys) {
    keys = {};
    storePromiseRequestKeys.set(storeInstance, keys);
  }
  return keys;
}
export function getPromiseRequestIdStore(
  storeInstance: object
): Partial<Record<PromiseKey, symbol>> {
  let ids = storePromiseRequestIds.get(storeInstance);
  if (!ids) {
    ids = {};
    storePromiseRequestIds.set(storeInstance, ids);
  }
  return ids;
}
