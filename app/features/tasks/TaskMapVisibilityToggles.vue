<template>
  <template v-if="isOnMap">
    <AppTooltip :text="focusLabel">
      <UButton
        data-testid="task-map-focus-toggle"
        size="xs"
        variant="ghost"
        :color="isFocused ? 'primary' : 'neutral'"
        :icon="isFocused ? 'i-mdi-crosshairs-gps' : 'i-mdi-crosshairs'"
        class="shrink-0"
        :aria-label="focusLabel"
        :aria-pressed="isFocused"
        @click.stop="preferencesStore.toggleMapFocusTask(taskId)"
      />
    </AppTooltip>
    <AppTooltip :text="hideLabel">
      <UButton
        data-testid="task-map-hide-toggle"
        size="xs"
        variant="ghost"
        :color="isShown ? 'neutral' : 'warning'"
        :icon="isShown ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'"
        class="shrink-0"
        :aria-label="hideLabel"
        :aria-pressed="!isShown"
        @click.stop="toggleShown"
      />
    </AppTooltip>
  </template>
</template>
<script setup lang="ts">
  import { getMapTaskUserVisibility } from '@/features/maps/utils/mapTaskVisibility';
  import { mapTaskVisibilityKey } from '@/features/tasks/task-context';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const props = defineProps<{
    taskId: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const context = inject(
    mapTaskVisibilityKey,
    computed(() => null)
  );
  const isOnMap = computed(() => context.value?.taskIds.has(props.taskId) ?? false);
  const isFocused = computed(
    () => context.value?.state.activeFocusTaskIds.has(props.taskId) ?? false
  );
  const visibility = computed(() =>
    context.value ? getMapTaskUserVisibility(props.taskId, context.value.state) : 'visible'
  );
  const isShown = computed(() => visibility.value === 'visible');
  // While focus is active, showing an out-of-focus quest means adding it to the focus set;
  // clearing it from the hidden set alone would have no visible effect.
  const toggleShown = () => {
    if (visibility.value === 'unfocused') {
      preferencesStore.toggleMapFocusTask(props.taskId);
      return;
    }
    preferencesStore.toggleMapHiddenTask(props.taskId);
  };
  const focusLabel = computed(() =>
    isFocused.value
      ? t('page.tasks.map.raid_plan.unfocus_quest')
      : t('page.tasks.map.raid_plan.focus_quest')
  );
  const hideLabel = computed(() =>
    isShown.value
      ? t('page.tasks.map.raid_plan.hide_quest')
      : t('page.tasks.map.raid_plan.show_quest')
  );
</script>
