import { RARITY_BORDER_MAP, REQUIREMENT_BORDER_MAP } from '@/features/neededitems/itemRarityBorder';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
const COMPLETE_SURFACE_CLASSES = {
  l: 'bg-gradient-to-l from-complete to-surface',
  t: 'bg-gradient-to-t from-complete to-surface',
} as const;
export const neededItemBorderClass = (
  backgroundColor: string | undefined,
  needType: (NeededItemTaskObjective | NeededItemHideoutModule)['needType']
) => {
  const bg = backgroundColor?.toLowerCase();
  if (bg && Object.hasOwn(RARITY_BORDER_MAP, bg)) return RARITY_BORDER_MAP[bg];
  return REQUIREMENT_BORDER_MAP[needType] ?? 'border-l-surface-600';
};
export const neededItemSurfaceClass = (isComplete: boolean, direction: 'l' | 't') =>
  isComplete ? COMPLETE_SURFACE_CLASSES[direction] : 'bg-surface-800';
