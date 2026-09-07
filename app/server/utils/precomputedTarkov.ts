/**
 * Shared contract for precomputed heavy-route payloads stored in Cloudflare KV.
 *
 * The scheduled GitHub Actions precompute workflow
 * (.github/workflows/precompute-tarkov-data.yml, via scripts/precompute) runs
 * the heavy fetch/adapt/overlay pipeline off the request path and writes the
 * final payload to KV. The Nitro request handlers read it back through
 * edgeCache, which keeps every colo warm without ever running the multi-MB
 * transform inside a request invocation (the cause of Cloudflare Error 1102
 * on cold, low-traffic colos).
 *
 * Both sides import this module so key format and envelope shape stay in sync.
 */
export const PRECOMPUTED_KV_BINDING = 'TARKOV_DATA';
export const PRECOMPUTED_ENVELOPE_VERSION = 2;
export const TASKS_CORE_PRECOMPUTED_VERSION = 'json-v4';
export type PrecomputedEnvelope<T> = {
  payload: T;
  overlay: { version: string; sha256: string } | null;
  storedAt: number;
  version: typeof PRECOMPUTED_ENVELOPE_VERSION;
};
export type PrecomputedKvReader = {
  get: (key: string, type: 'json') => Promise<unknown>;
};
export function buildTasksCorePrecomputedKey(lang: string, gameMode: string): string {
  return `tasks-core-${TASKS_CORE_PRECOMPUTED_VERSION}-${lang}-${gameMode}`;
}
const overlayMeta = (payload: unknown) =>
  (payload as { dataOverlay?: { version?: unknown; sha256?: unknown } })?.dataOverlay;
const nonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
export function precomputedOverlayIdentity(
  payload: unknown
): { version: string; sha256: string } | null {
  const meta = overlayMeta(payload);
  if (!meta) return null;
  if (!nonemptyString(meta.version) || !nonemptyString(meta.sha256)) return null;
  return { version: meta.version, sha256: meta.sha256 };
}
export function buildPrecomputedEnvelope<T>(payload: T): PrecomputedEnvelope<T> {
  return {
    payload,
    overlay: precomputedOverlayIdentity(payload),
    storedAt: Date.now(),
    version: PRECOMPUTED_ENVELOPE_VERSION,
  };
}
export function isPrecomputedEnvelope<T>(value: unknown): value is PrecomputedEnvelope<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PrecomputedEnvelope<T>>;
  const identity = precomputedOverlayIdentity(candidate.payload);
  const matchesIdentity =
    identity === null
      ? candidate.overlay === null
      : candidate.overlay?.version === identity.version &&
        candidate.overlay?.sha256 === identity.sha256;
  return (
    matchesIdentity &&
    candidate.version === PRECOMPUTED_ENVELOPE_VERSION &&
    typeof candidate.storedAt === 'number' &&
    Number.isFinite(candidate.storedAt) &&
    // A null/undefined payload means a corrupt write; rejecting it falls back
    // to the edge-cache path instead of serving null to clients.
    candidate.payload !== null &&
    candidate.payload !== undefined
  );
}
export function getPrecomputedStore(event: unknown): PrecomputedKvReader | null {
  if (!event || typeof event !== 'object') return null;
  const context = (event as { context?: { cloudflare?: { env?: Record<string, unknown> } } })
    .context;
  const binding = context?.cloudflare?.env?.[PRECOMPUTED_KV_BINDING];
  if (!binding || typeof binding !== 'object') return null;
  if (typeof (binding as { get?: unknown }).get !== 'function') return null;
  return binding as PrecomputedKvReader;
}
