import { storeToRefs } from 'pinia';
import { useDashboardFocusAnalytics } from '@/composables/useDashboardFocusAnalytics';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { getQueryString } from '@/utils/routeHelpers';
import type { Task } from '@/types/tarkov';
export type UseTaskDeepLinkOptions = {
  searchQuery: Ref<string>;
  filteredTasks: Ref<Task[]>;
  leafletMapRef: Ref<{
    activateObjectivePopup: (id: string) => boolean;
    closeActivePopup: () => void;
  } | null>;
};
export interface UseTaskDeepLinkReturn {
  pinnedTaskId: Ref<string | null>;
  pinnedTask: ComputedRef<Task | null>;
  clearPinnedTask: () => void;
  handleTaskQueryParam: () => Promise<void>;
  scrollToTask: (taskId: string) => Promise<boolean>;
  highlightTask: (taskElement: HTMLElement) => void;
  highlightObjective: (objectiveId: string) => Promise<void>;
  cleanup: () => void;
}
type TaskStatus = 'available' | 'locked' | 'completed' | 'failed';
export function useTaskDeepLink({
  searchQuery,
  filteredTasks,
  leafletMapRef,
}: UseTaskDeepLinkOptions): UseTaskDeepLinkReturn {
  const route = useRoute();
  const router = useRouter();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const { trackFocusedTaskVisible } = useDashboardFocusAnalytics();
  const { tasks } = storeToRefs(metadataStore);
  const { tasksCompletions, unlockedTasks, tasksFailed } = storeToRefs(progressStore);
  const pinnedTaskId = ref<string | null>(null);
  const highlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const objectiveHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const pinnedTask = computed(() => {
    if (!pinnedTaskId.value) return null;
    return filteredTasks.value.find((task) => task.id === pinnedTaskId.value) ?? null;
  });
  const clearPinnedTask = () => {
    pinnedTaskId.value = null;
  };
  const lightkeeperTraderId = computed(() => metadataStore.getTraderByName('lightkeeper')?.id);
  const getTaskStatus = (taskId: string): TaskStatus => {
    const isFailed = tasksFailed.value?.[taskId]?.['self'] ?? false;
    if (isFailed) return 'failed';
    const isCompleted = tasksCompletions.value?.[taskId]?.['self'] ?? false;
    if (isCompleted) return 'completed';
    const isUnlocked = unlockedTasks.value?.[taskId]?.['self'] ?? false;
    if (isUnlocked) return 'available';
    return 'locked';
  };
  const highlightTask = (taskElement: HTMLElement) => {
    taskElement.classList.add(
      'ring-2',
      'ring-primary-500',
      'ring-offset-2',
      'ring-offset-surface-900'
    );
    if (highlightTimeout.value) {
      clearTimeout(highlightTimeout.value);
    }
    highlightTimeout.value = setTimeout(() => {
      taskElement.classList.remove(
        'ring-2',
        'ring-primary-500',
        'ring-offset-2',
        'ring-offset-surface-900'
      );
      highlightTimeout.value = null;
    }, 2000);
  };
  const waitForObjectiveElement = async (
    objectiveId: string,
    maxAttempts = 30
  ): Promise<HTMLElement | null> => {
    return new Promise((resolve) => {
      let done = false;
      let observer: MutationObserver | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutMs = maxAttempts * 50;
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      };
      const checkElement = () => {
        const element =
          document.getElementById(`objective-${objectiveId}`) ??
          document.querySelector<HTMLElement>(`[data-objective-ids*="${objectiveId}"]`);
        if (element && !done) {
          done = true;
          cleanup();
          resolve(element);
        }
        return element;
      };
      if (checkElement()) return;
      observer = new MutationObserver(() => {
        if (done) return;
        checkElement();
      });
      const observeTarget =
        document.getElementById('task-list') ||
        document.getElementById('task-container') ||
        document.body;
      observer.observe(observeTarget, { childList: true, subtree: true });
      timeoutId = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        resolve(checkElement() || null);
      }, timeoutMs);
    });
  };
  const highlightObjective = async (objectiveId: string) => {
    if (objectiveHighlightTimeout.value) {
      clearTimeout(objectiveHighlightTimeout.value);
      objectiveHighlightTimeout.value = null;
    }
    document.querySelectorAll('.objective-highlight').forEach((element) => {
      element.classList.remove('objective-highlight');
    });
    const element = await waitForObjectiveElement(objectiveId, 30);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('objective-highlight');
    objectiveHighlightTimeout.value = setTimeout(() => {
      element.classList.remove('objective-highlight');
      objectiveHighlightTimeout.value = null;
    }, 3500);
  };
  const waitForTaskToRender = async (taskId: string, maxAttempts = 10) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await nextTick();
      if (filteredTasks.value.some((task) => task.id === taskId)) {
        return true;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });
      }
    }
    return filteredTasks.value.some((task) => task.id === taskId);
  };
  const waitForTaskElement = async (taskId: string, maxAttempts = 40) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await nextTick();
      const taskElement = document.getElementById(`task-${taskId}`);
      if (taskElement) {
        return taskElement;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });
      }
    }
    return document.getElementById(`task-${taskId}`);
  };
  const scrollToTask = async (taskId: string) => {
    const didRenderTask = await waitForTaskToRender(taskId);
    if (!didRenderTask) return false;
    const taskIndex = filteredTasks.value.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) return false;
    pinnedTaskId.value = taskId;
    const focusedTaskElement = await waitForTaskElement(taskId);
    if (!focusedTaskElement) return false;
    focusedTaskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightTask(focusedTaskElement);
    return true;
  };
  const handleTaskQueryParam = async () => {
    const taskId = getQueryString(route.query.task);
    const objectiveIdToHighlight = getQueryString(route.query.highlightObjective);
    if (!taskId) return;
    const taskInMetadata = tasks.value.find((t) => t.id === taskId);
    if (!taskInMetadata) return;
    if (searchQuery.value) {
      searchQuery.value = '';
    }
    if (!objectiveIdToHighlight) {
      const isKappaRequired = taskInMetadata.kappaRequired === true;
      const isLightkeeperRequired = taskInMetadata.lightkeeperRequired === true;
      const isLightkeeperTraderTask =
        lightkeeperTraderId.value !== undefined
          ? taskInMetadata.trader?.id === lightkeeperTraderId.value
          : taskInMetadata.trader?.name?.toLowerCase() === 'lightkeeper';
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired && !isLightkeeperTraderTask;
      const canEvaluateRequiredKeys = metadataStore.tasksObjectivesHydrated;
      const hasRequiredKeys =
        canEvaluateRequiredKeys && (taskInMetadata.requiredKeys?.length ?? 0) > 0;
      if (
        (isLightkeeperRequired || isLightkeeperTraderTask) &&
        !preferencesStore.getShowLightkeeperTasks
      ) {
        preferencesStore.setShowLightkeeperTasks(true);
      }
      if (isKappaRequired && preferencesStore.getHideNonKappaTasks) {
        preferencesStore.setHideNonKappaTasks(false);
      }
      if (isNonSpecial && !preferencesStore.getShowNonSpecialTasks) {
        preferencesStore.setShowNonSpecialTasks(true);
      }
      if (
        canEvaluateRequiredKeys &&
        !hasRequiredKeys &&
        preferencesStore.getOnlyTasksWithRequiredKeys
      ) {
        preferencesStore.setOnlyTasksWithRequiredKeys(false);
      }
      const currentSecondaryView = preferencesStore.getTaskSecondaryView;
      if (currentSecondaryView !== 'all') {
        const status = getTaskStatus(taskId);
        if (currentSecondaryView !== status) {
          preferencesStore.setTaskSecondaryView(status);
        }
      }
      if (preferencesStore.getTaskPrimaryView !== 'all') {
        preferencesStore.setTaskPrimaryView('all');
      }
    }
    await nextTick();
    const didFocusTask = await scrollToTask(taskId);
    if (!didFocusTask) return;
    trackFocusedTaskVisible(taskId);
    if (objectiveIdToHighlight) {
      await highlightObjective(objectiveIdToHighlight);
      leafletMapRef.value?.activateObjectivePopup(objectiveIdToHighlight);
    }
    const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
    delete nextQuery.task;
    delete nextQuery.highlightObjective;
    router.replace({ query: nextQuery });
  };
  const cleanup = () => {
    if (highlightTimeout.value) {
      clearTimeout(highlightTimeout.value);
      highlightTimeout.value = null;
    }
    if (objectiveHighlightTimeout.value) {
      clearTimeout(objectiveHighlightTimeout.value);
      objectiveHighlightTimeout.value = null;
    }
  };
  return {
    pinnedTaskId,
    pinnedTask,
    clearPinnedTask,
    handleTaskQueryParam,
    scrollToTask,
    highlightTask,
    highlightObjective,
    cleanup,
  };
}
