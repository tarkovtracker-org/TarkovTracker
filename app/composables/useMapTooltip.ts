import { useMetadataStore } from '@/stores/useMetadata';
type MetadataStore = ReturnType<typeof useMetadataStore>;
type Objective = MetadataStore['objectives'][number];
type Task = MetadataStore['tasks'][number];
export interface UseMapTooltipReturn {
  forceTooltipToggle: () => void;
  showTooltip: () => void;
  hideTooltip: () => void;
  tooltipVisible: ComputedRef<boolean>;
  relatedObjective: ComputedRef<Objective | undefined>;
  relatedTask: ComputedRef<Task | undefined>;
}
export function useMapTooltip(markId: () => string | undefined): UseMapTooltipReturn {
  const metadataStore = useMetadataStore();
  const forceTooltip = ref(false);
  const hoverTooltip = ref(false);
  const forceTooltipToggle = () => {
    forceTooltip.value = !forceTooltip.value;
  };
  const showTooltip = () => {
    hoverTooltip.value = true;
  };
  const hideTooltip = () => {
    hoverTooltip.value = false;
  };
  const tooltipVisible = computed(() => {
    return forceTooltip.value || hoverTooltip.value;
  });
  const relatedObjective = computed(() => {
    return metadataStore.objectives.find((obj) => obj.id === markId());
  });
  const relatedTask = computed(() => {
    return metadataStore.tasks.find((task) => task.id === relatedObjective.value?.taskId);
  });
  return {
    forceTooltipToggle,
    showTooltip,
    hideTooltip,
    tooltipVisible,
    relatedObjective,
    relatedTask,
  };
}
