export const diagnosticEvent = () => ({
  event: 'progress_sync_payload',
  buildCommit: 'a'.repeat(40),
  aggregateWireBytes: 900_000,
  requestWireBytes: 300_000,
  modes: {
    pvp: {
      wireBytes: 899_990,
      counts: {
        taskCompletions: 1200,
        taskObjectives: 2200,
        taskAvailability: 0,
        hideoutParts: 16,
        hideoutModules: 5,
        traders: 9,
        skills: 52,
        skillOffsets: 0,
        storyChapters: 7,
        apiUpdateHistory: 100,
        manualActivityHistory: 200,
      },
    },
  },
  batchModes: ['pvp'],
  outcome: 'payload_too_large',
});
export const clientDiagnosticBody = () => ({
  level: 'warn',
  href: null,
  timestamp: '2026-11-14T12:00:00.000Z',
  args: ['progress_sync_payload', diagnosticEvent()],
});
