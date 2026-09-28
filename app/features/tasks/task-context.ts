import type { ComputedRef, InjectionKey, Ref } from '#imports';
import type { DashboardFocusProgressInteraction } from '@/composables/useDashboardFocusAnalytics';
export type JumpToMapObjective = (objectiveId: string) => void | Promise<void>;
export type TrackTaskProgressInteraction = (
  taskId: string,
  interaction: DashboardFocusProgressInteraction
) => void;
export const jumpToMapObjectiveKey: InjectionKey<JumpToMapObjective> = Symbol('jumpToMapObjective');
export const isMapViewKey: InjectionKey<Ref<boolean>> = Symbol('isMapView');
export const impactEligibleTaskIdsKey: InjectionKey<ComputedRef<Set<string> | undefined>> =
  Symbol('impactEligibleTaskIds');
export const trackTaskProgressInteractionKey: InjectionKey<TrackTaskProgressInteraction> = Symbol(
  'trackTaskProgressInteraction'
);
export interface MapTaskVisibilityContext {
  /** Tasks that draw at least one marker on the selected map. */
  taskIds: readonly string[];
  hiddenTaskIds: ReadonlySet<string>;
}
export const mapTaskVisibilityKey: InjectionKey<ComputedRef<MapTaskVisibilityContext | null>> =
  Symbol('mapTaskVisibility');
