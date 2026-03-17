<template>
  <section class="bg-field border-border-muted rounded-lg border p-3">
    <div class="mb-2 flex items-center gap-2">
      <UIcon name="i-mdi-cog" class="text-warning-400 h-4 w-4" />
      <h3 class="text-foreground text-xs font-semibold tracking-wide uppercase">
        {{ t('page.tasks.settings.tabs.advanced') }}
      </h3>
    </div>
    <div class="space-y-1">
      <label
        class="hover:bg-interactive flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="enableManualTaskFailModel" />
        <span class="text-foreground text-sm">
          {{ t('page.tasks.settings.advanced.manual_fail_actions') }}
        </span>
      </label>
      <div
        v-if="failedTasksCount > 0"
        class="bg-raised border-border-muted mt-2 rounded border p-2"
      >
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-foreground-subtle text-xs">
            {{ t('page.tasks.settings.advanced.failed_tasks_label') }}
          </span>
          <UBadge color="warning" variant="soft" size="xs">
            {{ failedTasksCount }}
          </UBadge>
        </div>
        <UButton color="warning" variant="soft" size="xs" block @click="emit('repair')">
          <UIcon name="i-mdi-wrench" class="mr-1 h-3.5 w-3.5" />
          {{ t('page.tasks.settings.advanced.repair_failed_action') }}
        </UButton>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  const props = defineProps<{
    enableManualTaskFail: boolean;
    failedTasksCount: number;
  }>();
  const emit = defineEmits<{
    'update:enableManualTaskFail': [value: boolean];
    repair: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const enableManualTaskFailModel = computed({
    get: () => props.enableManualTaskFail,
    set: (value: boolean) => emit('update:enableManualTaskFail', value),
  });
</script>
