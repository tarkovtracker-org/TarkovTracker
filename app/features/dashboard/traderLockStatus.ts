import { GAME_MODES, resolveTraderUnlockTaskIds } from '@/utils/constants';
import { storyObjectiveRequirements } from '@/utils/taskOtherRequirements';
import type { StoryChapter, Task, Trader } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
type LockTask = Pick<Task, 'id' | 'name' | 'trader' | 'finishRewards' | 'otherRequirements'>;
type LockChapter = Pick<StoryChapter, 'id' | 'name' | 'traderUnlocks'>;
export type LockTrader = Pick<Trader, 'id' | 'normalizedName'>;
export type TraderUnlockRequirement =
  | { kind: 'task'; task: { id: string; name: string } | null }
  | {
      kind: 'story';
      chapter: { id: string; name: string };
      objective: { id: string; name: string };
    };
export interface TraderLockStatusDeps {
  tasks: LockTask[] | null | undefined;
  isTaskComplete: (taskId: string) => boolean;
  gameMode?: GameMode;
  storyChapters?: LockChapter[] | null;
  isStoryObjectiveComplete?: (chapterId: string, objectiveId: string) => boolean;
  isStoryChapterComplete?: (chapterId: string) => boolean;
  getTraderLevel?: (traderId: string) => number;
  getTraderReputation?: (traderId: string) => number;
}
type StoryGate = ReturnType<typeof storyObjectiveRequirements>[number];
const rewardEntryId = (entry: unknown): string | undefined => {
  if (typeof entry === 'string') return entry;
  const id = (entry as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};
/** json.tarkov.dev ships `traderUnlock` as an id list; older shapes used a single object. */
const unlockedTraderIds = (task: LockTask): string[] => {
  const raw: unknown = task.finishRewards?.traderUnlock;
  const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
  return entries.map(rewardEntryId).filter((id): id is string => Boolean(id));
};
const configuredUnlockTaskIds = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  resolveTraderUnlockTaskIds(trader.normalizedName, deps.gameMode ?? GAME_MODES.PVP);
const unlockTasksFor = (trader: LockTrader, deps: TraderLockStatusDeps, configured: string[]) => {
  const configuredIds = new Set(configured);
  return (deps.tasks ?? []).filter(
    (task) => configuredIds.has(task.id) || unlockedTraderIds(task).includes(trader.id)
  );
};
const hasCompletedUnlockTask = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  unlockTasksFor(trader, deps, configuredUnlockTaskIds(trader, deps)).some((task) =>
    deps.isTaskComplete(task.id)
  );
const taskRequirement = (
  trader: LockTrader,
  deps: TraderLockStatusDeps
): TraderUnlockRequirement | null => {
  const configured = configuredUnlockTaskIds(trader, deps);
  if (!deps.tasks?.length) return configured.length ? { kind: 'task', task: null } : null;
  const [first] = unlockTasksFor(trader, deps, configured);
  if (!first || hasCompletedUnlockTask(trader, deps)) return null;
  return { kind: 'task', task: { id: first.id, name: first.name ?? '' } };
};
const unlockChaptersFor = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  new Map(
    (deps.storyChapters ?? [])
      .filter((chapter) => chapter.traderUnlocks?.some((unlock) => unlock.id === trader.id))
      .map((chapter) => [chapter.id, chapter])
  );
/** The trader's own tasks name the storyline objective that opens them (e.g. "Talk to Ragman"). */
const storyGateFor = (trader: LockTrader, deps: TraderLockStatusDeps) => {
  const chapters = unlockChaptersFor(trader, deps);
  if (!chapters.size) return null;
  const gate = (deps.tasks ?? [])
    .filter((task) => task.trader?.id === trader.id)
    .flatMap((task) => storyObjectiveRequirements(task as Task))
    .find((requirement) => chapters.has(requirement.storyChapter.id));
  return gate ? { gate, chapter: chapters.get(gate.storyChapter.id)! } : null;
};
const storyGateMet = (gate: StoryGate, deps: TraderLockStatusDeps) =>
  Boolean(
    deps.isStoryObjectiveComplete?.(gate.storyChapter.id, gate.objective.id) ||
    deps.isStoryChapterComplete?.(gate.storyChapter.id)
  );
// Checks every metadata task, not the dashboard-filtered trader counts.
const hasCompletedTraderTask = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  (deps.tasks ?? []).some((task) => task.trader?.id === trader.id && deps.isTaskComplete(task.id));
const hasTraderStanding = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  (deps.getTraderLevel?.(trader.id) ?? 1) > 1 || (deps.getTraderReputation?.(trader.id) ?? 0) > 0;
/** Progress recorded before story gates existed still proves the trader is open. */
const hasTraderProgress = (trader: LockTrader, deps: TraderLockStatusDeps) =>
  hasCompletedTraderTask(trader, deps) ||
  hasCompletedUnlockTask(trader, deps) ||
  hasTraderStanding(trader, deps);
const storyRequirement = (
  trader: LockTrader,
  deps: TraderLockStatusDeps
): TraderUnlockRequirement | null => {
  const found = storyGateFor(trader, deps);
  if (!found || storyGateMet(found.gate, deps) || hasTraderProgress(trader, deps)) return null;
  return {
    kind: 'story',
    chapter: { id: found.chapter.id, name: found.gate.storyChapter.name || found.chapter.name },
    objective: { id: found.gate.objective.id, name: found.gate.objective.name ?? '' },
  };
};
/** What the player still has to do before this trader opens, or `null` when it is open. */
export const resolveTraderUnlock = (
  trader: LockTrader,
  deps: TraderLockStatusDeps
): TraderUnlockRequirement | null =>
  taskRequirement(trader, deps) ?? storyRequirement(trader, deps);
