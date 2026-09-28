<template>
  <template v-if="isOnMap">
    <AppTooltip v-if="!isHidden" :text="t('page.tasks.map.raid_plan.show_only_quest')">
      <UButton
        data-testid="task-map-show-only"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-mdi-filter-outline"
        class="shrink-0"
        :aria-label="t('page.tasks.map.raid_plan.show_only_quest')"
        @click.stop="showOnly"
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
  const isOnMap = computed(() => context.value?.taskIds.includes(props.taskId) ?? false);
  const isHidden = computed(() => context.value?.hiddenTaskIds.has(props.taskId) ?? false);
  const hideLabel = computed(() =>
    isHidden.value
      ? t('page.tasks.map.raid_plan.show_quest')
      : t('page.tasks.map.raid_plan.hide_quest')
  );
  const showOnly = () => {
    preferencesStore.showOnlyMapTask(props.taskId, context.value?.taskIds ?? []);
  };
</script>
