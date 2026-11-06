import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import {
  isEligibleImportEvent,
  knownQuestEventTime,
  latestEftQuestEvents,
  type EftQuestEventMode,
  type EftQuestEventStatus,
  type EftQuestImportEvent,
} from '@/utils/eftLogQuestParser';
export const EFT_QUEST_STATES = ['completed', 'started', 'failed'] as const;
export interface EftLogImportSelection {
  modes: readonly EftQuestEventMode[];
  statuses: readonly EftQuestEventStatus[];
  since: Partial<Record<GameMode, number>>;
}
/** Known modes default on; unidentified history requires opt-in when known evidence is available. */
export function createEftLogImportSelection(
  events: EftQuestImportEvent[] = []
): EftLogImportSelection {
  const modes: EftQuestEventMode[] = [...GAME_MODE_VALUES];
  if (!events.some(isEligibleImportEvent)) modes.push('unknown');
  return { modes, statuses: [...EFT_QUEST_STATES], since: {} };
}
/** Rejects invalid/out-of-range dates rather than allowing them to widen selected history. */
export function isInvalidEftLogCutoff(time: number | undefined): boolean {
  if (time === undefined) return false;
  return !Number.isFinite(time) || time < 0 || time > 8.64e15;
}
/** Unidentified history may only route into an explicitly chosen, included destination. */
function selectedDestination(
  mode: EftQuestEventMode,
  selection: EftLogImportSelection,
  targetMode?: GameMode
): GameMode | undefined {
  const destination = mode === 'unknown' ? targetMode : mode;
  return destination && selection.modes.includes(destination) ? destination : undefined;
}
/** Only selected sources and the unidentified destination can apply a cutoff. */
export function hasInvalidEftLogCutoff(
  selection: EftLogImportSelection,
  targetMode?: GameMode
): boolean {
  return selection.modes.some((mode) => {
    const destination = selectedDestination(mode, selection, targetMode);
    return destination !== undefined && isInvalidEftLogCutoff(selection.since[destination]);
  });
}
/** Applies the destination's reset cutoff to original event time, never its replay delivery time. */
function isWithinImportHistory(
  event: EftQuestImportEvent,
  selection: EftLogImportSelection,
  targetMode?: GameMode
): boolean {
  const mode = selectedDestination(event.mode, selection, targetMode);
  if (!mode) return false;
  const cutoff = selection.since[mode];
  if (cutoff === undefined) return true;
  const time = knownQuestEventTime(event);
  return time !== null && time >= cutoff;
}
/** Filters source modes/history before routing, and quest states only after latest-state reconciliation.
 * Filtering states first could resurrect an older completion superseded by a failure or restart.
 */
export function selectEftImportEvents(
  events: EftQuestImportEvent[],
  selection: EftLogImportSelection,
  targetMode?: GameMode
): EftQuestImportEvent[] {
  const history = events.filter(
    (event) =>
      selection.modes.includes(event.mode) && isWithinImportHistory(event, selection, targetMode)
  );
  return latestEftQuestEvents(history, targetMode).filter((event) =>
    selection.statuses.includes(event.status)
  );
}
