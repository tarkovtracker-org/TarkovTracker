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
type MutablePromiseStore = {
  -readonly [K in keyof PromiseStore]: PromiseStore[K];
};
const PROMISE_STORE_KEY = Symbol('metadataPromiseStore');
const PROMISE_REQUEST_KEYS_KEY = Symbol('metadataPromiseRequestKeys');
const PROMISE_REQUEST_IDS_KEY = Symbol('metadataPromiseRequestIds');
type PromiseStoreHost = object & {
  [PROMISE_REQUEST_IDS_KEY]?: Partial<Record<PromiseKey, symbol>>;
  [PROMISE_REQUEST_KEYS_KEY]?: Partial<Record<PromiseKey, string>>;
  [PROMISE_STORE_KEY]?: MutablePromiseStore;
};
function setHiddenStoreValue<T>(storeInstance: PromiseStoreHost, key: symbol, value: T): T {
  Object.defineProperty(storeInstance, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: true,
  });
  return value;
}
export function getPromiseStore(storeInstance: object): MutablePromiseStore {
  const host = storeInstance as PromiseStoreHost;
  let promises = host[PROMISE_STORE_KEY];
  if (!promises) {
    promises = setHiddenStoreValue(host, PROMISE_STORE_KEY, {
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
    });
  }
  return promises;
}
export function getPromiseRequestKeyStore(
  storeInstance: object
): Partial<Record<PromiseKey, string>> {
  const host = storeInstance as PromiseStoreHost;
  let keys = host[PROMISE_REQUEST_KEYS_KEY];
  if (!keys) {
    keys = setHiddenStoreValue(host, PROMISE_REQUEST_KEYS_KEY, {});
  }
  return keys;
}
export function getPromiseRequestIdStore(
  storeInstance: object
): Partial<Record<PromiseKey, symbol>> {
  const host = storeInstance as PromiseStoreHost;
  let ids = host[PROMISE_REQUEST_IDS_KEY];
  if (!ids) {
    ids = setHiddenStoreValue(host, PROMISE_REQUEST_IDS_KEY, {});
  }
  return ids;
}
