/** Reset and newer startup claims synchronously invalidate suspended work, including A→B→A. */
let startupGeneration = 0;
export type StartupOwnershipGuard = () => boolean;
export const invalidateStartupOwnership = (): void => {
  startupGeneration += 1;
};
/** Pair this generation guard with the live identity check before resuming startup effects. */
export const beginStartupOwnership = (): StartupOwnershipGuard => {
  const generation = ++startupGeneration;
  return () => startupGeneration === generation;
};
