import { describe, expect, it } from 'vitest';
import {
  createEftLogImportSelection,
  hasInvalidEftLogCutoff,
  selectEftImportEvents,
} from '@/utils/eftLogImportSelection';
import type { EftQuestImportEvent } from '@/utils/eftLogQuestParser';
const questId = '61604635c725987e815b1a46';
const event = (
  mode: EftQuestImportEvent['mode'],
  status: EftQuestImportEvent['status'],
  occurredAt = 1000
): EftQuestImportEvent => ({
  mode,
  status,
  questId,
  eventKey: `${mode}:${status}:${occurredAt}`,
  occurredAt,
  timestamp: '2026-10-01 10:00:00.000',
});
describe('EFT import selection', () => {
  it('defaults to known modes and requires opting in to unidentified evidence in mixed logs', () => {
    expect(
      createEftLogImportSelection([event('pve', 'completed'), event('unknown', 'started')]).modes
    ).not.toContain('unknown');
    expect(createEftLogImportSelection([event('unknown', 'completed')]).modes).toContain('unknown');
  });
  it('validates cutoffs only for selected sources and the unidentified destination', () => {
    const selection = {
      ...createEftLogImportSelection(),
      modes: ['pve'] as const,
      since: { pvp: NaN },
    };
    expect(hasInvalidEftLogCutoff(selection, 'pvp')).toBe(false);
    const unidentified = { ...selection, modes: ['unknown'] as const };
    expect(hasInvalidEftLogCutoff(unidentified, 'pve')).toBe(false);
    expect(hasInvalidEftLogCutoff(unidentified, 'pvp')).toBe(false);
    expect(hasInvalidEftLogCutoff({ ...unidentified, modes: ['pvp', 'unknown'] }, 'pvp')).toBe(
      true
    );
    expect(hasInvalidEftLogCutoff({ ...selection, modes: ['pvp'] }, 'pve')).toBe(true);
  });
  it('imports only the selected source mode without routing excluded unknown events', () => {
    const events = ['pvp', 'pve', 'seasonal', 'unknown'].map((mode) =>
      event(mode as EftQuestImportEvent['mode'], 'completed')
    );
    const selection = { ...createEftLogImportSelection(events), modes: ['pve'] as const };
    expect(selectEftImportEvents(events, selection, 'pvp')).toEqual([events[1]]);
  });
  it('does not route unidentified evidence without an explicit included destination', () => {
    const events = [event('unknown', 'completed')];
    const selection = {
      ...createEftLogImportSelection(events),
      modes: ['pve', 'unknown'] as const,
    };
    expect(selectEftImportEvents(events, selection, 'pvp')).toEqual([]);
    expect(selectEftImportEvents(events, selection)).toEqual([]);
    expect(selectEftImportEvents(events, selection, 'pve')[0]?.mode).toBe('pve');
  });
  it('filters states after reconciliation instead of resurrecting an older completion', () => {
    const events = [event('pve', 'completed'), event('pve', 'failed', 2000)];
    const selection = { ...createEftLogImportSelection(events), statuses: ['completed'] as const };
    expect(selectEftImportEvents(events, selection, 'pve')).toEqual([]);
  });
  it('excludes replayed pre-reset events using original time, with independent inclusive mode cutoffs', () => {
    const events = [event('pvp', 'completed'), event('pve', 'started', 2000)];
    const selection = { ...createEftLogImportSelection(events), since: { pvp: 2000, pve: 2000 } };
    expect(selectEftImportEvents(events, selection, 'pve')).toEqual([events[1]]);
  });
  it('uses receipt time only when original time is absent and excludes undated events with a cutoff', () => {
    const undated = {
      ...event('pve', 'completed'),
      occurredAt: undefined,
      timestamp: null,
      questId: '5ac2426c86f774138762edfe',
    };
    const dated = { ...event('pve', 'started'), occurredAt: undefined };
    const selection = {
      ...createEftLogImportSelection([dated]),
      since: { pve: Date.parse('2026-10-01T10:00:00Z') },
    };
    expect(selectEftImportEvents([undated, dated], selection, 'pve')).toEqual([dated]);
  });
  it('applies the destination cutoff to unidentified evidence after explicit routing', () => {
    const events = [event('unknown', 'completed')];
    const selection = { ...createEftLogImportSelection(events), since: { pve: 2000 } };
    expect(selectEftImportEvents(events, selection, 'pve')).toEqual([]);
    expect(selectEftImportEvents(events, selection, 'pvp')[0]?.mode).toBe('pvp');
  });
  it('allows empty mode or state selections without falling back to all data', () => {
    const events = [event('pve', 'completed')];
    expect(
      selectEftImportEvents(events, { ...createEftLogImportSelection(events), modes: [] }, 'pve')
    ).toEqual([]);
    expect(
      selectEftImportEvents(events, { ...createEftLogImportSelection(events), statuses: [] }, 'pve')
    ).toEqual([]);
  });
});
