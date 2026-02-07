import { storeToRefs } from 'pinia';
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
  scrollToTask: (taskId: string) => Promise<void>;
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
  const { tasks } = storeToRefs(metadataStore);
  const { tasksCompletions, unlockedTasks, tasksFailed } = storeToRefs(progressStore);
  const pinnedTaskId = ref<string | null>(null);
  const pinnedTaskTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const objectiveHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const pinnedTask = computed(() => {
    if (!pinnedTaskId.value) return null;
    return filteredTasks.value.find((task) => task.id === pinnedTaskId.value) ?? null;
  });
  const clearPinnedTask = () => {
    pinnedTaskId.value = null;
    if (pinnedTaskTimeout.value) {
      clearTimeout(pinnedTaskTimeout.value);
      pinnedTaskTimeout.value = null;
    }
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
  const scrollToTask = async (taskId: string) => {
    await nextTick();
    const taskIndex = filteredTasks.value.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return;
    const pinTaskToTop = () => {
      pinnedTaskId.value = taskId;
      if (pinnedTaskTimeout.value) {
        clearTimeout(pinnedTaskTimeout.value);
      }
      pinnedTaskTimeout.value = setTimeout(() => {
        pinnedTaskId.value = null;
        pinnedTaskTimeout.value = null;
      }, 8000);
    };
    const taskElement = document.getElementById(`task-${taskId}`);
    if (taskElement) {
      const rect = taskElement.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (isVisible) {
        highlightTask(taskElement);
        return;
      }
      const nearbyThreshold = window.innerHeight * 1.5;
      const isNearby = Math.abs(rect.top) <= nearbyThreshold;
      if (isNearby) {
        taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightTask(taskElement);
        return;
      }
      pinTaskToTop();
      await nextTick();
      const pinnedElement = document.getElementById(`task-${taskId}`);
      if (pinnedElement) {
        highlightTask(pinnedElement);
      }
      return;
    }
    pinTaskToTop();
    await nextTick();
    const newTaskElement = document.getElementById(`task-${taskId}`);
    if (!newTaskElement) return;
    highlightTask(newTaskElement);
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
    await scrollToTask(taskId);
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
    if (pinnedTaskTimeout.value) {
      clearTimeout(pinnedTaskTimeout.value);
      pinnedTaskTimeout.value = null;
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
