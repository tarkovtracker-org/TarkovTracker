const modes = ['pvp', 'pve', 'seasonal'] as const;
type Mode = (typeof modes)[number];
const outcomes = ['accepted', 'failed', 'superseded', 'payload_too_large'] as const;
const countFields = [
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
type Counts = Record<(typeof countFields)[number], number>;
type ModeSummary = { wireBytes: number; counts: Counts };
export type ProgressDiagnosticEvent = {
  event: 'progress_sync_payload';
  buildCommit: string;
  aggregateWireBytes: number;
  requestWireBytes: number;
  modes: Partial<Record<Mode, ModeSummary>>;
  batchModes: Mode[];
  outcome: (typeof outcomes)[number];
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid record');
  return value as Record<string, unknown>;
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid count');
  }
  return value;
};
const modeName = (value: unknown): Mode => {
  if (!modes.includes(value as Mode)) throw new Error('Invalid mode');
  return value as Mode;
};
const modeSummary = (value: unknown): ModeSummary => {
  const summary = record(value);
  const counts = record(summary.counts);
  return {
    wireBytes: integer(summary.wireBytes),
    counts: Object.fromEntries(
      countFields.map((field) => [field, integer(counts[field])])
    ) as Counts,
  };
};
const modeSummaries = (value: unknown): ProgressDiagnosticEvent['modes'] => {
  const entries = Object.entries(record(value));
  if (!entries.length || entries.length > modes.length) throw new Error('Invalid modes');
  return Object.fromEntries(
    entries.map(([mode, summary]) => [modeName(mode), modeSummary(summary)])
  );
};
const modeList = (value: unknown): Mode[] => {
  if (!Array.isArray(value) || !value.length || value.length > modes.length) {
    throw new Error('Invalid batch');
  }
  return value.map(modeName);
};
const batchModes = (value: unknown, summaries: ProgressDiagnosticEvent['modes']): Mode[] => {
  const batch = modeList(value);
  if (new Set(batch).size !== batch.length) throw new Error('Duplicate modes');
  if (batch.some((mode) => !Object.hasOwn(summaries, mode))) throw new Error('Missing mode');
  return batch;
};
const buildCommit = (value: unknown): string => {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40})?$/.test(value)) {
    throw new Error('Invalid build');
  }
  return value;
};
const outcome = (value: unknown): ProgressDiagnosticEvent['outcome'] => {
  if (!outcomes.includes(value as ProgressDiagnosticEvent['outcome'])) {
    throw new Error('Invalid outcome');
  }
  return value as ProgressDiagnosticEvent['outcome'];
};
/** Reconstruct the allowlist: never spread client objects or retain unknown fields. */
export const sanitizeProgressDiagnostic = (value: unknown): ProgressDiagnosticEvent => {
  const input = record(value);
  const summaries = modeSummaries(input.modes);
  return {
    event: 'progress_sync_payload',
    buildCommit: buildCommit(input.buildCommit),
    aggregateWireBytes: integer(input.aggregateWireBytes),
    requestWireBytes: integer(input.requestWireBytes),
    modes: summaries,
    batchModes: batchModes(input.batchModes, summaries),
    outcome: outcome(input.outcome),
  };
};
export const clientProgressDiagnostic = (value: unknown): ProgressDiagnosticEvent => {
  const args = record(value).args;
  if (!Array.isArray(args) || args.length !== 2 || args[0] !== 'progress_sync_payload') {
    throw new Error('Invalid diagnostic');
  }
  return sanitizeProgressDiagnostic(args[1]);
};
