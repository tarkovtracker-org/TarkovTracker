import { overlayEntries, scopedOverlay } from './overlayProjectors';
import { adaptHideoutResponse, adaptItemsResponse } from './tarkov-json';
import type { OverlayData } from './overlayTypes';
import type { HideoutStation, TarkovItem } from '@/types/tarkov';
export const addFallbackItems = (
  items: TarkovItem[],
  overlay: OverlayData,
  mode: string
): TarkovItem[] => {
  const existing = new Set(items.map((item) => item.id));
  const additions = overlayEntries(scopedOverlay(overlay, 'itemsAdd', mode)).filter(
    (item) => !existing.has(String(item.id))
  );
  return [...items, ...adaptItemsResponse({ items: additions }).data.items];
};
const craftTaskUnlock = (raw: Record<string, unknown>) => {
  if (typeof raw.taskUnlock === 'string') return { id: raw.taskUnlock };
  if (raw.taskUnlock && typeof raw.taskUnlock === 'object') return raw.taskUnlock;
  return null;
};
const adaptAddedCraft = (raw: Record<string, unknown>) => {
  const taskUnlock = craftTaskUnlock(raw);
  return {
    ...raw,
    rewardItems: raw.productItem ? [raw.productItem] : [],
    taskUnlock,
    unlockState: taskUnlock ? 'task' : 'unknown',
  };
};
export const addFallbackCrafts = (
  stations: HideoutStation[],
  overlay: OverlayData,
  mode: string
): HideoutStation[] => {
  const existing = new Set(
    stations.flatMap((station) =>
      station.levels.flatMap((level) => level.crafts?.map((craft) => craft.id) ?? [])
    )
  );
  const additions = overlayEntries(scopedOverlay(overlay, 'craftsAdd', mode)).filter(
    (craft) => !existing.has(String(craft.id))
  );
  return stations.map((station) => ({
    ...station,
    levels: station.levels.map((level) => {
      const rawCrafts = additions
        .filter((craft) => craft.station === station.id && craft.level === level.level)
        .map(adaptAddedCraft);
      const adapted =
        adaptHideoutResponse([
          { id: station.id, levels: [{ level: level.level, crafts: rawCrafts }] },
        ]).data.hideoutStations[0]?.levels[0]?.crafts ?? [];
      return { ...level, crafts: [...(level.crafts ?? []), ...adapted] };
    }),
  }));
};
