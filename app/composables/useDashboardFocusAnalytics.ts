import { useAnalyticsEvents } from '@/composables/useAnalyticsEvents';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { TaskActionPayload } from '@/composables/useTaskActions';
export type DashboardRecommendationClickVariant = 'primary' | 'secondary';
export type DashboardFocusProgressInteraction =
  | 'objective_progress'
  | 'task_active'
  | 'task_available'
  | 'task_complete'
  | 'task_fail'
  | 'task_reset_failed'
  | 'task_uncomplete';
type DashboardFocusAttribution = {
  clickedAt: number;
  firstActionTracked: boolean;
  recommendationId: string;
  reason: string;
  taskId: string;
  taskVisibleTracked: boolean;
  variant: DashboardRecommendationClickVariant;
};
const DASHBOARD_FOCUS_ATTRIBUTION_MAX_AGE_MS = 1000 * 60 * 30;
const isDashboardFocusAttribution = (value: unknown): value is DashboardFocusAttribution => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DashboardFocusAttribution>;
  return (
    typeof candidate.clickedAt === 'number' &&
    typeof candidate.firstActionTracked === 'boolean' &&
    typeof candidate.recommendationId === 'string' &&
    typeof candidate.reason === 'string' &&
    typeof candidate.taskId === 'string' &&
    typeof candidate.taskVisibleTracked === 'boolean' &&
    (candidate.variant === 'primary' || candidate.variant === 'secondary')
  );
};
const getNow = () => Date.now();
export function useDashboardFocusAnalytics(): {
  clearRecommendationAttribution: () => void;
  trackFocusedTaskAction: (payload: TaskActionPayload) => void;
  trackFocusedTaskProgress: (
    taskId: string,
    interaction: DashboardFocusProgressInteraction
  ) => void;
  trackFocusedTaskVisible: (taskId: string) => void;
  trackRecommendationClick: (input: {
    recommendationId: string;
    reason: string;
    taskId?: string;
    variant: DashboardRecommendationClickVariant;
  }) => void;
} {
  const { trackEvent } = useAnalyticsEvents();
  const readAttribution = (): DashboardFocusAttribution | null => {
    if (!import.meta.client) return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEYS.dashboardFocusAttribution);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isDashboardFocusAttribution(parsed)) {
        window.sessionStorage.removeItem(STORAGE_KEYS.dashboardFocusAttribution);
        return null;
      }
      if (getNow() - parsed.clickedAt > DASHBOARD_FOCUS_ATTRIBUTION_MAX_AGE_MS) {
        window.sessionStorage.removeItem(STORAGE_KEYS.dashboardFocusAttribution);
        return null;
      }
      return parsed;
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEYS.dashboardFocusAttribution);
      return null;
    }
  };
  const writeAttribution = (attribution: DashboardFocusAttribution) => {
    if (!import.meta.client) return;
    window.sessionStorage.setItem(
      STORAGE_KEYS.dashboardFocusAttribution,
      JSON.stringify(attribution)
    );
  };
  const clearRecommendationAttribution = () => {
    if (!import.meta.client) return;
    window.sessionStorage.removeItem(STORAGE_KEYS.dashboardFocusAttribution);
  };
  const trackRecommendationClick = ({
    recommendationId,
    reason,
    taskId,
    variant,
  }: {
    recommendationId: string;
    reason: string;
    taskId?: string;
    variant: DashboardRecommendationClickVariant;
  }) => {
    trackEvent('dashboard_recommendation_click', {
      recommendation_id: recommendationId,
      recommendation_reason: reason,
      recommendation_variant: variant,
      task_id: taskId,
    });
    if (!taskId) {
      clearRecommendationAttribution();
      return;
    }
    if (!import.meta.client) return;
    writeAttribution({
      clickedAt: getNow(),
      firstActionTracked: false,
      recommendationId,
      reason,
      taskId,
      taskVisibleTracked: false,
      variant,
    });
  };
  const getMatchingAttribution = (taskId: string) => {
    const attribution = readAttribution();
    if (!attribution || attribution.taskId !== taskId) return null;
    return attribution;
  };
  const trackFocusedTaskVisible = (taskId: string) => {
    const attribution = getMatchingAttribution(taskId);
    if (!attribution || attribution.taskVisibleTracked) return;
    trackEvent('dashboard_recommendation_task_visible', {
      recommendation_id: attribution.recommendationId,
      recommendation_reason: attribution.reason,
      recommendation_variant: attribution.variant,
      task_id: attribution.taskId,
      time_to_task_visible_ms: Math.max(0, getNow() - attribution.clickedAt),
    });
    writeAttribution({
      ...attribution,
      taskVisibleTracked: true,
    });
  };
  const trackFocusedTaskProgress = (
    taskId: string,
    interaction: DashboardFocusProgressInteraction
  ) => {
    const attribution = getMatchingAttribution(taskId);
    if (!attribution || attribution.firstActionTracked) return;
    trackEvent('dashboard_recommendation_first_action', {
      interaction,
      recommendation_id: attribution.recommendationId,
      recommendation_reason: attribution.reason,
      recommendation_variant: attribution.variant,
      task_id: attribution.taskId,
      time_to_first_action_ms: Math.max(0, getNow() - attribution.clickedAt),
    });
    writeAttribution({
      ...attribution,
      firstActionTracked: true,
    });
  };
  const trackFocusedTaskAction = (payload: TaskActionPayload) => {
    switch (payload.action) {
      case 'active':
        trackFocusedTaskProgress(payload.taskId, 'task_active');
        return;
      case 'available':
        trackFocusedTaskProgress(payload.taskId, 'task_available');
        return;
      case 'fail':
        trackFocusedTaskProgress(payload.taskId, 'task_fail');
        return;
      case 'reset_failed':
        trackFocusedTaskProgress(payload.taskId, 'task_reset_failed');
        return;
      case 'uncomplete':
        trackFocusedTaskProgress(payload.taskId, 'task_uncomplete');
        return;
      case 'complete': {
        const attribution = getMatchingAttribution(payload.taskId);
        if (!attribution) return;
        if (!attribution.firstActionTracked) {
          trackFocusedTaskProgress(payload.taskId, 'task_complete');
        }
        trackEvent('dashboard_recommendation_task_completed', {
          recommendation_id: attribution.recommendationId,
          recommendation_reason: attribution.reason,
          recommendation_variant: attribution.variant,
          task_id: attribution.taskId,
          time_to_task_complete_ms: Math.max(0, getNow() - attribution.clickedAt),
        });
        clearRecommendationAttribution();
        return;
      }
      default:
        return;
    }
  };
  return {
    clearRecommendationAttribution,
    trackFocusedTaskAction,
    trackFocusedTaskProgress,
    trackFocusedTaskVisible,
    trackRecommendationClick,
  };
}
