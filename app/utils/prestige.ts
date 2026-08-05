import type { Task } from '@/types/tarkov';
const NEW_BEGINNING_ID_PATTERN = /^new_beginning_prestige_(\d+)$/i;
const NEW_BEGINNING_WIKI_PATTERN = /\/New_Beginning(?:_\(Prestige_(\d+)\))?(?:[?#].*)?$/i;
const parsePositivePrestigeLevel = (match: RegExpMatchArray | null | undefined): number | null => {
  return Math.max(0, Number.parseInt(match?.[1] ?? '', 10)) || null;
};
export const inferNewBeginningPrestigeLevel = (
  task: Pick<Task, 'id' | 'wikiLink'>
): number | null => {
  return (
    parsePositivePrestigeLevel(task.wikiLink?.match(NEW_BEGINNING_WIKI_PATTERN)) ??
    parsePositivePrestigeLevel(task.id.match(NEW_BEGINNING_ID_PATTERN))
  );
};
