import type { ComputedRef, InjectionKey } from '#imports';
import type { HideoutStation, Task, TarkovItem } from '@/types/tarkov';
export type NeededItemTeamNeed = { user: string; count: number };
export type NeededItemImageItem = {
  backgroundColor?: string;
  iconLink?: string;
  image512pxLink?: string;
} | null;
export type NeededItemContext = {
  craftableIconClass: ComputedRef<string>;
  craftableTitle: ComputedRef<string>;
  currentCount: ComputedRef<number>;
  goToCraftStation: () => Promise<void>;
  imageItem: ComputedRef<NeededItemImageItem>;
  isCraftable: ComputedRef<boolean>;
  isKappaRequired: ComputedRef<boolean>;
  isLightkeeperRequired: ComputedRef<boolean>;
  isParentCompleted: ComputedRef<boolean>;
  item: ComputedRef<TarkovItem | null>;
  /** All accepted items when the objective allows alternatives (display-only). */
  acceptedItems: ComputedRef<TarkovItem[]>;
  /** True when more than one item is accepted (alternatives exist), regardless of motion. */
  hasAlternativeItems: ComputedRef<boolean>;
  /** True when more than one item is accepted and the display is rotating. */
  isCyclingItems: ComputedRef<boolean>;
  /** Pause/resume the ambient item rotation (e.g. while a list popover is open). */
  setCyclingPaused: (paused: boolean) => void;
  levelRequired: ComputedRef<number>;
  lockedBefore: ComputedRef<number>;
  neededCount: ComputedRef<number>;
  relatedStation: ComputedRef<HideoutStation | null>;
  relatedTask: ComputedRef<Task | null>;
  selfCompletedNeed: ComputedRef<boolean>;
  teamNeeds: ComputedRef<NeededItemTeamNeed[]>;
  cardStyle: ComputedRef<'compact' | 'expanded'>;
};
export const neededItemKey: InjectionKey<NeededItemContext> = Symbol('neededitem');
export const createDefaultNeededItemContext = (): NeededItemContext => {
  const asComputed = <T>(value: T): ComputedRef<T> => computed(() => value);
  return {
    craftableIconClass: asComputed(''),
    craftableTitle: asComputed('Craftable'),
    currentCount: asComputed(0),
    goToCraftStation: async () => {},
    imageItem: asComputed(null),
    isCraftable: asComputed(false),
    isKappaRequired: asComputed(false),
    isLightkeeperRequired: asComputed(false),
    isParentCompleted: asComputed(false),
    item: asComputed(null),
    acceptedItems: asComputed([]),
    hasAlternativeItems: asComputed(false),
    isCyclingItems: asComputed(false),
    setCyclingPaused: () => {},
    levelRequired: asComputed(0),
    lockedBefore: asComputed(0),
    neededCount: asComputed(0),
    relatedStation: asComputed(null),
    relatedTask: asComputed(null),
    selfCompletedNeed: asComputed(false),
    teamNeeds: asComputed([]),
    cardStyle: asComputed('expanded'),
  };
};
