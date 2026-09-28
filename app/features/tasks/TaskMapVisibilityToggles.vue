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
        :color="isHidden ? 'warning' : 'neutral'"
        :icon="isHidden ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
        class="shrink-0"
        :aria-label="hideLabel"
        :aria-pressed="isHidden"
        @click.stop="preferencesStore.toggleMapHiddenTask(taskId)"
      />
    </AppTooltip>
  </template>
</template>
<script setup lang="ts">
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
  const isHidden = computed(() => context.value?.state.hiddenTaskIds.has(props.taskId) ?? false);
  const focusLabel = computed(() =>
    isFocused.value
      ? t('page.tasks.map.raid_plan.unfocus_quest')
      : t('page.tasks.map.raid_plan.focus_quest')
  );
  const hideLabel = computed(() =>
    isHidden.value
      ? t('page.tasks.map.raid_plan.show_quest')
      : t('page.tasks.map.raid_plan.hide_quest')
  );
</script>
