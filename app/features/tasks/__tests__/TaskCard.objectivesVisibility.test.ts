import { describe, expect, it } from 'vitest';
import { computed, nextTick, ref, type ComputedRef, watch } from 'vue';
type ObjectivesVisibilityState = {
  isComplete: ReturnType<typeof ref<boolean>>;
  hideCompletedObjectives: ReturnType<typeof ref<boolean>>;
  objectivesExpanded: ReturnType<typeof ref<boolean>>;
  objectivesVisible: ComputedRef<boolean>;
  toggleObjectivesVisibility: () => void;
};
const createObjectivesVisibilityState = (options: {
  hideCompletedObjectives: boolean;
  isComplete: boolean;
}): ObjectivesVisibilityState => {
  const isComplete = ref(options.isComplete);
  const hideCompletedObjectives = ref(options.hideCompletedObjectives);
  const objectivesExpanded = ref(true);
  const shouldAutoCollapseObjectives = computed(() => {
    return isComplete.value && hideCompletedObjectives.value;
  });
  watch(
    shouldAutoCollapseObjectives,
    (shouldAutoCollapse) => {
      if (shouldAutoCollapse) {
        objectivesExpanded.value = false;
      }
    },
    { immediate: true }
  );
  const objectivesVisible = computed(() => {
    return objectivesExpanded.value && !shouldAutoCollapseObjectives.value;
  });
  const toggleObjectivesVisibility = () => {
    objectivesExpanded.value = !objectivesExpanded.value;
  };
  return {
    isComplete,
    hideCompletedObjectives,
    objectivesExpanded,
    objectivesVisible,
    toggleObjectivesVisibility,
  };
};
describe('TaskCard objectives visibility behavior', () => {
  it('keeps completed objectives hidden when hide preference is enabled', async () => {
    const state = createObjectivesVisibilityState({
      hideCompletedObjectives: true,
      isComplete: true,
    });
    await nextTick();
    expect(state.objectivesVisible.value).toBe(false);
    state.toggleObjectivesVisibility();
    await nextTick();
    expect(state.objectivesVisible.value).toBe(false);
  });
  it('allows toggling objectives when hide preference is disabled', async () => {
    const state = createObjectivesVisibilityState({
      hideCompletedObjectives: false,
      isComplete: true,
    });
    await nextTick();
    expect(state.objectivesVisible.value).toBe(true);
    state.toggleObjectivesVisibility();
    await nextTick();
    expect(state.objectivesVisible.value).toBe(false);
    state.toggleObjectivesVisibility();
    await nextTick();
    expect(state.objectivesVisible.value).toBe(true);
  });
  it('collapses when preference is enabled after task completion', async () => {
    const state = createObjectivesVisibilityState({
      hideCompletedObjectives: false,
      isComplete: true,
    });
    await nextTick();
    expect(state.objectivesVisible.value).toBe(true);
    state.hideCompletedObjectives.value = true;
    await nextTick();
    expect(state.objectivesVisible.value).toBe(false);
  });
});
