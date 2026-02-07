import type { SuggestedKeyGroup, TaskObjective, TarkovItem } from '@/types/tarkov';
const dedupeItems = (items: TarkovItem[]): TarkovItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};
const dedupeMaps = (
  maps: TaskObjective['maps']
): NonNullable<SuggestedKeyGroup['maps']> | undefined => {
  if (!maps?.length) return undefined;
  const seen = new Set<string>();
  return maps.filter((map) => {
    if (!map?.id || seen.has(map.id)) return false;
    seen.add(map.id);
    return true;
  });
};
export const buildSuggestedKeysFromObjectives = (
  objectives?: TaskObjective[]
): SuggestedKeyGroup[] => {
  if (!objectives?.length) return [];
  const groups: SuggestedKeyGroup[] = [];
  const seenGroups = new Set<string>();
  objectives.forEach((objective) => {
    const objectiveMaps = dedupeMaps(objective.maps);
    const mapSignature =
      objectiveMaps
        ?.map((map) => map.id)
        .sort()
        .join(',') ?? '';
    objective.requiredKeys?.forEach((requiredGroup) => {
      const keys = dedupeItems(requiredGroup ?? []);
      if (!keys.length) return;
      const keySignature = keys
        .map((key) => key.id)
        .sort()
        .join(',');
      const groupSignature = `${mapSignature}|${keySignature}`;
      if (seenGroups.has(groupSignature)) return;
      seenGroups.add(groupSignature);
      groups.push({ keys, maps: objectiveMaps });
    });
  });
  return groups;
};
