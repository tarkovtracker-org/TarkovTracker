import { buildOverlayResponseHeaders } from '@/server/utils/overlayResponseHeaders';
import { isPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import type { PrecomputedEnvelope, PrecomputedKvReader } from '@/server/utils/precomputedTarkov';
const MAX_RETAINED_BYTES = 16 * 1024 * 1024;
type EnvelopeValidator = (value: unknown) => value is PrecomputedEnvelope<unknown>;
type SerializedPayload = { text: string; body: string; headers: Record<string, string> };
type Entry = SerializedPayload & { store: PrecomputedKvReader; key: string; namespace: string };
function serializePayload(text: unknown, validate: EnvelopeValidator): SerializedPayload | null {
  if (typeof text !== 'string') return null;
  const envelope: unknown = JSON.parse(text);
  if (!validate(envelope)) return null;
  const meta = (envelope.payload as { dataOverlay?: unknown } | null)?.dataOverlay;
  return {
    text,
    body: JSON.stringify(envelope.payload),
    headers: buildOverlayResponseHeaders(meta),
  };
}
function sameSource(entry: Entry, scope: Omit<Entry, keyof SerializedPayload>, text: unknown) {
  return sameScope(entry, scope) && entry.text === text;
}
function sameScope(entry: Entry, scope: Omit<Entry, keyof SerializedPayload>) {
  return (
    entry.store === scope.store && entry.key === scope.key && entry.namespace === scope.namespace
  );
}
function boundedEntry(entry: Entry, maxBytes: number): Entry | undefined {
  // Count both strings conservatively as UTF-16. Include namespace/key and header strings in the same budget.
  const strings = [
    entry.text,
    entry.body,
    entry.key,
    entry.namespace,
    ...Object.entries(entry.headers).flat(),
  ];
  const bytes = strings.reduce((total, value) => total + 2 * value.length, 0);
  return bytes <= maxBytes ? entry : undefined;
}
function freshResponse(entry: SerializedPayload): Response {
  // Never retain a request-owned Response/stream or expose mutable parsed objects across requests.
  return new Response(entry.body, {
    headers: { 'Content-Type': 'application/json', ...entry.headers },
  });
}
/** One public entry per reader; validator identity is fixed by this closure, never shared with imports. */
export function createPrecomputedResponseReader(
  validate: EnvelopeValidator = isPrecomputedEnvelope,
  maxBytes = MAX_RETAINED_BYTES
) {
  let entry: Entry | undefined;
  return async (
    store: PrecomputedKvReader,
    key: string,
    namespace: string
  ): Promise<Response | null> => {
    // Always reread KV with its existing consistency/cacheTtl behavior. No extra freshness window.
    const text = await store.get(key, 'text');
    const scope = { store, key, namespace };
    if (entry && sameSource(entry, scope, text)) return freshResponse(entry);
    entry = undefined;
    const serialized = serializePayload(text, validate);
    if (!serialized) return null;
    entry = boundedEntry({ ...scope, ...serialized }, maxBytes);
    return freshResponse(serialized);
  };
}
export const readPrecomputedResponse = createPrecomputedResponseReader();
