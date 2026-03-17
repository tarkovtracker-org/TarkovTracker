import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardFocusAnalytics } from '@/composables/useDashboardFocusAnalytics';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const createClarityMock = (): NonNullable<Window['clarity']> =>
  vi.fn() as unknown as NonNullable<Window['clarity']>;
describe('useDashboardFocusAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    window.sessionStorage.clear();
    window.__ttGoogleAnalyticsReady = true;
    window.__ttMicrosoftClarityReady = true;
    window.gtag = vi.fn();
    window.clarity = createClarityMock();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
    delete window.__ttGoogleAnalyticsReady;
    delete window.__ttMicrosoftClarityReady;
    delete window.gtag;
    delete window.clarity;
  });
  it('tracks recommendation clicks and persists attribution for task links', () => {
    const { trackRecommendationClick } = useDashboardFocusAnalytics();
    trackRecommendationClick({
      recommendationId: 'available-task-1',
      reason: 'impact',
      taskId: 'task-1',
      variant: 'primary',
    });
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'dashboard_recommendation_click',
      expect.objectContaining({
        recommendation_id: 'available-task-1',
        recommendation_reason: 'impact',
        recommendation_variant: 'primary',
        task_id: 'task-1',
      })
    );
    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEYS.dashboardFocusAttribution) || '{}')
    ).toMatchObject({
      firstActionTracked: false,
      recommendationId: 'available-task-1',
      reason: 'impact',
      taskId: 'task-1',
      taskVisibleTracked: false,
      variant: 'primary',
    });
  });
  it('clears stored attribution when a recommendation click does not target a task', () => {
    const { trackFocusedTaskVisible, trackRecommendationClick } = useDashboardFocusAnalytics();
    trackRecommendationClick({
      recommendationId: 'available-task-1',
      reason: 'impact',
      taskId: 'task-1',
      variant: 'primary',
    });
    trackRecommendationClick({
      recommendationId: 'filters-hidden',
      reason: 'filter-hidden',
      variant: 'secondary',
    });
    expect(window.sessionStorage.getItem(STORAGE_KEYS.dashboardFocusAttribution)).toBeNull();
    trackFocusedTaskVisible('task-1');
    expect(window.gtag).not.toHaveBeenCalledWith(
      'event',
      'dashboard_recommendation_task_visible',
      expect.any(Object)
    );
    expect(window.sessionStorage.getItem(STORAGE_KEYS.dashboardFocusAttribution)).toBeNull();
  });
  it('tracks the focused task funnel and clears attribution after completion', () => {
    const {
      trackFocusedTaskAction,
      trackFocusedTaskProgress,
      trackFocusedTaskVisible,
      trackRecommendationClick,
    } = useDashboardFocusAnalytics();
    trackRecommendationClick({
      recommendationId: 'available-task-1',
      reason: 'impact',
      taskId: 'task-1',
      variant: 'secondary',
    });
    vi.setSystemTime(new Date('2026-03-12T12:00:05.000Z'));
    trackFocusedTaskVisible('task-1');
    vi.setSystemTime(new Date('2026-03-12T12:00:09.000Z'));
    trackFocusedTaskProgress('task-1', 'objective_progress');
    trackFocusedTaskProgress('task-1', 'objective_progress');
    vi.setSystemTime(new Date('2026-03-12T12:00:22.000Z'));
    trackFocusedTaskAction({
      action: 'complete',
      taskId: 'task-1',
      taskName: 'Task 1',
    });
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'dashboard_recommendation_task_visible',
      expect.objectContaining({
        recommendation_variant: 'secondary',
        task_id: 'task-1',
        time_to_task_visible_ms: 5000,
      })
    );
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'dashboard_recommendation_first_action',
      expect.objectContaining({
        interaction: 'objective_progress',
        recommendation_variant: 'secondary',
        task_id: 'task-1',
        time_to_first_action_ms: 9000,
      })
    );
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'dashboard_recommendation_task_completed',
      expect.objectContaining({
        recommendation_variant: 'secondary',
        task_id: 'task-1',
        time_to_task_complete_ms: 22000,
      })
    );
    expect(window.sessionStorage.getItem(STORAGE_KEYS.dashboardFocusAttribution)).toBeNull();
  });
});
