import { normalizeBuildCommit } from '@/utils/buildCommit';
import { isProgressPayloadTooLarge } from '@/utils/progressPayload';
import type { ModeProgressMap } from '@/stores/tarkov/acknowledgedModes';
const encoder = new TextEncoder();
const bytes = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;
const mapFields = [
  'taskCompletions',
  'taskObjectives',
  'taskAvailability',
  'hideoutParts',
  'hideoutModules',
  'traders',
  'skills',
  'skillOffsets',
  'storyChapters',
  'apiUpdateHistory',
  'manualActivityHistory',
] as const;
const describeModes = (modes: ModeProgressMap) =>
  Object.fromEntries(
    Object.entries(modes).map(([mode, progress]) => [
      mode,
      {
        wireBytes: bytes(progress),
        counts: Object.fromEntries(
          mapFields.map((field) => [field, Object.keys(progress[field] ?? {}).length])
        ),
      },
    ])
  );
let sent = 0;
let lastSentAt = 0;
let lastRejectedAt = 0;
/** Aggregate numbers only. No profile keys/values, owner, location, or server error contents. */
export const reportProgressPayload = (
  modes: ModeProgressMap,
  batch: ModeProgressMap,
  error: unknown
): void => {
  const requestWireBytes = bytes(batch);
  if (requestWireBytes < 256 * 1024 && !isProgressPayloadTooLarge(error)) return;
  const config = tryUseNuxtApp()?.$config?.public;
  const sink = config?.clientLogSinkUrl;
  const oversized = isProgressPayloadTooLarge(error);
  const previous = oversized ? lastRejectedAt : lastSentAt;
  if (typeof sink !== 'string' || !sink || sent >= 30 || Date.now() - previous < 12_000) return;
  const summary = {
    buildCommit: normalizeBuildCommit(config?.buildCommit),
    aggregateWireBytes: bytes(modes),
    requestWireBytes,
    modes: describeModes(modes),
    batchModes: Object.keys(batch),
    outcome: isProgressPayloadTooLarge(error) ? 'payload_too_large' : error ? 'failed' : 'accepted',
  };
  const body = JSON.stringify({
    level: 'warn',
    href: null,
    timestamp: new Date().toISOString(),
    args: ['progress_sync_payload', summary],
  });
  sent += 1;
  if (oversized) lastRejectedAt = Date.now();
  else lastSentAt = Date.now();
  // Diagnostics never affect save acknowledgement, including synchronous transport failures.
  try {
    void fetch(sink, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  } catch {
    /* Some browsers reject a keepalive request synchronously. */
  }
};
