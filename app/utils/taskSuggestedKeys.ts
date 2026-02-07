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
  const requiredGroupsByMap = new Map<string, SuggestedKeyGroup>();
  const optionalGroupsByMap = new Map<string, SuggestedKeyGroup>();
  objectives.forEach((objective) => {
    const objectiveMaps = dedupeMaps(objective.maps);
    const mapSignature =
      objectiveMaps
        ?.map((map) => map.id)
        .sort()
        .join(',') ?? '';
    const flattenedObjectiveKeys = dedupeItems((objective.requiredKeys ?? []).flat());
    if (!flattenedObjectiveKeys.length) return;
    const isOptional = objective.optional === true;
    const targetGroups = isOptional ? optionalGroupsByMap : requiredGroupsByMap;
    const existingGroup = targetGroups.get(mapSignature);
    if (existingGroup) {
      existingGroup.keys = dedupeItems([...existingGroup.keys, ...flattenedObjectiveKeys]);
      return;
    }
    targetGroups.set(mapSignature, {
      keys: flattenedObjectiveKeys,
      maps: objectiveMaps,
      optional: isOptional,
    });
  });
  optionalGroupsByMap.forEach((optionalGroup, mapSignature) => {
    const requiredGroup = requiredGroupsByMap.get(mapSignature);
    if (!requiredGroup?.keys.length) return;
    const requiredKeyIds = new Set(requiredGroup.keys.map((key) => key.id));
    optionalGroup.keys = optionalGroup.keys.filter((key) => !requiredKeyIds.has(key.id));
  });
  return [
    ...requiredGroupsByMap.values(),
    ...Array.from(optionalGroupsByMap.values()).filter((group) => group.keys.length > 0),
  ];
};
