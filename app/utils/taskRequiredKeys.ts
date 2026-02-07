import type { RequiredKeyGroup, TaskObjective, TarkovItem } from '@/types/tarkov';
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
): NonNullable<RequiredKeyGroup['maps']> | undefined => {
  if (!maps?.length) return undefined;
  const seen = new Set<string>();
  return maps.filter((map) => {
    if (!map?.id || seen.has(map.id)) return false;
    seen.add(map.id);
    return true;
  });
};
const buildGroupSignature = (group: RequiredKeyGroup): string => {
  const mapSignature =
    group.maps
      ?.map((map) => map.id)
      .sort()
      .join(',') ?? '';
  const keySignature = group.keys
    .map((key) => key.id)
    .sort()
    .join(',');
  return `${group.anyOf === true ? 'any' : 'all'}|${mapSignature}|${keySignature}`;
};
export const buildRequiredKeysFromObjectives = (
  objectives?: TaskObjective[]
): RequiredKeyGroup[] => {
  if (!objectives?.length) return [];
  const requiredGroups: RequiredKeyGroup[] = [];
  const requiredGroupSignatures = new Set<string>();
  const optionalGroupsBySignature = new Map<string, RequiredKeyGroup>();
  objectives.forEach((objective) => {
    const objectiveMaps = dedupeMaps(objective.maps);
    const keyMatrix = (objective.requiredKeys ?? [])
      .map((keyGroup) => dedupeItems(keyGroup))
      .filter((keyGroup) => keyGroup.length > 0);
    if (!keyMatrix.length) return;
    const isOptional = objective.optional === true;
    for (const innerGroup of keyMatrix) {
      const keyGroup: RequiredKeyGroup = {
        keys: innerGroup,
        maps: objectiveMaps,
        optional: isOptional,
        anyOf: innerGroup.length > 1,
      };
      const groupSignature = buildGroupSignature(keyGroup);
      if (keyGroup.optional) {
        if (
          requiredGroupSignatures.has(groupSignature) ||
          optionalGroupsBySignature.has(groupSignature)
        ) {
          continue;
        }
        optionalGroupsBySignature.set(groupSignature, keyGroup);
        continue;
      }
      if (requiredGroupSignatures.has(groupSignature)) continue;
      requiredGroupSignatures.add(groupSignature);
      requiredGroups.push(keyGroup);
      optionalGroupsBySignature.delete(groupSignature);
    }
  });
  return [...requiredGroups, ...Array.from(optionalGroupsBySignature.values())];
};
