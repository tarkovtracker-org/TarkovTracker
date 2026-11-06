import { normalizeBuildCommit } from '@/utils/buildCommit';
import { isProgressPayloadTooLarge, isProgressSyncInterrupted } from '@/utils/progressPayload';
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
const sent = { other: 0, rejected: 0 };
const sampleKind = (error: unknown): keyof typeof sent =>
  isProgressPayloadTooLarge(error) ? 'rejected' : 'other';
let lastSentAt = 0;
let lastRejectedAt = 0;
const isDiagnosticCandidate = (requestBytes: number, error: unknown): boolean =>
  requestBytes >= 256 * 1024 || isProgressPayloadTooLarge(error);
const previousSampleAt = (error: unknown): number =>
  isProgressPayloadTooLarge(error) ? lastRejectedAt : lastSentAt;
const canSendDiagnostic = (sink: unknown, previous: number, samples: number): sink is string =>
  typeof sink === 'string' && sink.length > 0 && samples < 30 && Date.now() - previous >= 12_000;
const diagnosticConfig = (error: unknown) => {
  const config = tryUseNuxtApp()?.$config.public;
  if (!config) return null;
  const sink = config.progressDiagnosticSinkUrl;
  if (!canSendDiagnostic(sink, previousSampleAt(error), sent[sampleKind(error)])) return null;
  return { sink, buildCommit: normalizeBuildCommit(config.buildCommit) };
};
const payloadOutcome = (error: unknown): string => {
  if (isProgressPayloadTooLarge(error)) return 'payload_too_large';
  if (isProgressSyncInterrupted(error)) return 'superseded';
  return error ? 'failed' : 'accepted';
};
const diagnosticBody = (
  modes: ModeProgressMap,
  batch: ModeProgressMap,
  error: unknown,
  buildCommit: string
) =>
  JSON.stringify({
    level: 'warn',
    href: null,
    timestamp: new Date().toISOString(),
    args: [
      'progress_sync_payload',
      {
        buildCommit,
        aggregateWireBytes: bytes(modes),
        requestWireBytes: bytes(batch),
        modes: describeModes(modes),
        batchModes: Object.keys(batch),
        outcome: payloadOutcome(error),
      },
    ],
  });
const recordSample = (error: unknown): void => {
  sent[sampleKind(error)] += 1;
  if (isProgressPayloadTooLarge(error)) lastRejectedAt = Date.now();
  else lastSentAt = Date.now();
};
const sendDiagnostic = (sink: string, body: string): void => {
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
/** Aggregate numbers only. No profile keys/values, owner, location, or server error contents. */
export const reportProgressPayload = (
  modes: ModeProgressMap,
  batch: ModeProgressMap,
  error: unknown
): void => {
  const config = diagnosticConfig(error);
  if (!config) return;
  if (!isDiagnosticCandidate(bytes(batch), error)) return;
  const body = diagnosticBody(modes, batch, error, config.buildCommit);
  recordSample(error);
  sendDiagnostic(config.sink, body);
};
