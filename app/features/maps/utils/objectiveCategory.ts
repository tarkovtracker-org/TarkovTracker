import type { MapMark } from '@/features/maps/utils/marksHash';
export type ObjectiveCategory = 'self' | 'pinned' | 'team';
export const getObjectiveCategory = (mark: MapMark): ObjectiveCategory => {
  if (mark.pinned) return 'pinned';
  return mark.users?.includes('self') ? 'self' : 'team';
};
