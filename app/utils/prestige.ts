import type { PrestigeLevel, Task } from '@/types/tarkov';
const NEW_BEGINNING_ID_PATTERN = /^new_beginning_prestige_(\d+)$/i;
const NEW_BEGINNING_WIKI_PATTERN = /\/New_Beginning(?:_\(Prestige_(\d+)\))?(?:[?#].*)?$/i;
const parsePositivePrestigeLevel = (match: RegExpMatchArray | null | undefined): number | null => {
  return Number.parseInt(match?.[1] ?? '', 10) || null;
};
export const inferNewBeginningPrestigeLevel = (
  task: Pick<Task, 'id' | 'wikiLink'>
): number | null => {
  return (
    parsePositivePrestigeLevel(task.wikiLink?.match(NEW_BEGINNING_WIKI_PATTERN)) ??
    parsePositivePrestigeLevel(task.id.match(NEW_BEGINNING_ID_PATTERN))
  );
};
const requiredPrestigeId = (task: Task) => task.requiredPrestige?.id;
const isNewBeginningTask = (task: Task): boolean => {
  if (!task.id) return false;
  if (requiredPrestigeId(task)) return true;
  if (inferNewBeginningPrestigeLevel(task) !== null) return true;
  return task.name === 'New Beginning';
};
const levelForPrestige = (prestige: PrestigeLevel) => prestige.prestigeLevel ?? prestige.level;
const knownPrestigeLevels = (levels: PrestigeLevel[]) =>
  new Map(
    levels.flatMap((prestige) => {
      const level = levelForPrestige(prestige);
      return prestige.id && typeof level === 'number' ? [[prestige.id, level] as const] : [];
    })
  );
const requiredPrestigeEntries = (tasks: Task[], levels: Map<string, number>) =>
  tasks.flatMap((task) => {
    const level = levels.get(requiredPrestigeId(task) ?? '');
    return level !== undefined && level >= 0 ? [[task.id, level] as const] : [];
  });
const acceptsPrestigeCondition = (
  task: { id: string; name?: string },
  knownTaskIds: Set<string>
) => (knownTaskIds.size > 0 ? knownTaskIds.has(task.id) : task.name === 'New Beginning');
const setUnmappedPrestige = (map: Map<string, number>, id: string, level: number) => {
  if (!map.has(id)) map.set(id, level);
};
const addPrestigeConditions = (
  map: Map<string, number>,
  prestige: PrestigeLevel,
  knownTaskIds: Set<string>
) => {
  const level = levelForPrestige(prestige) ?? 0;
  if (level <= 0) return;
  (prestige.conditions ?? []).forEach((condition) => {
    const task = condition.task;
    if (task && acceptsPrestigeCondition(task, knownTaskIds))
      setUnmappedPrestige(map, task.id, level - 1);
  });
};
const addInferredPrestige = (map: Map<string, number>, task: Task) => {
  if (!isNewBeginningTask(task)) return;
  const level = inferNewBeginningPrestigeLevel(task);
  if (level && level >= 1) setUnmappedPrestige(map, task.id, level - 1);
};
/** Resolve requiredPrestige IDs first, then condition and synthetic-task fallbacks. */
export function buildPrestigeTaskMap(
  tasks: Task[],
  prestigeLevels: PrestigeLevel[]
): Map<string, number> {
  const map = new Map(requiredPrestigeEntries(tasks, knownPrestigeLevels(prestigeLevels)));
  const knownTaskIds = new Set(tasks.filter(isNewBeginningTask).map((task) => task.id));
  for (const prestige of prestigeLevels) addPrestigeConditions(map, prestige, knownTaskIds);
  for (const task of tasks) addInferredPrestige(map, task);
  return map;
}
