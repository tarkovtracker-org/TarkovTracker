import type { Task } from '@/types/tarkov';
/** In-game trader task-list sections, in the order the game shows them; `other` is unknown. */
const TRADER_TASK_SECTIONS = ['ll1', 'll2', 'll3', 'll4', 'essential', 'other'] as const;
export type TraderTaskSection = (typeof TRADER_TASK_SECTIONS)[number];
export interface TraderTaskSectionGroup {
  section: TraderTaskSection;
  tasks: Task[];
}
const SECTION_BY_GROUP: Record<number, TraderTaskSection> = {
  0: 'essential',
  1: 'll1',
  2: 'll2',
  3: 'll3',
  4: 'll4',
};
const traderTaskSection = (task: Task): TraderTaskSection =>
  SECTION_BY_GROUP[task.traderTaskGroup ?? -1] ?? 'other';
/** Only worth sectioning when at least one task carries a known group. */
export const hasTraderTaskGroups = (tasks: Task[]): boolean =>
  tasks.some((task) => traderTaskSection(task) !== 'other');
/** Stable: keeps the active sort order inside each section, drops empty sections. */
export const groupTasksByTraderSection = (tasks: Task[]): TraderTaskSectionGroup[] =>
  TRADER_TASK_SECTIONS.map((section) => ({
    section,
    tasks: tasks.filter((task) => traderTaskSection(task) === section),
  })).filter((group) => group.tasks.length > 0);
/**
 * Section order, so incremental rendering fills one section before the next. Pinned tasks stay
 * first, as filtering ordered them, so pagination never pushes one out of the pinned section.
 */
export const orderTasksByTraderSection = (
  tasks: Task[],
  pinnedIds: ReadonlySet<string> = new Set()
): Task[] => [
  ...tasks.filter((task) => pinnedIds.has(task.id)),
  ...groupTasksByTraderSection(tasks.filter((task) => !pinnedIds.has(task.id))).flatMap(
    (group) => group.tasks
  ),
];
