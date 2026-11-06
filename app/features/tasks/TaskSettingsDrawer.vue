<template>
  <SettingsDrawer page-key="tasks" :mode="mode" :title="t('page.tasks.settings.title')">
    <p
      data-testid="task-settings-filters-note"
      class="bg-primary-500/8 border-primary-500/20 text-surface-300 mb-4 flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs"
    >
      <UIcon name="i-mdi-filter-variant" class="text-primary-400 mt-px h-4 w-4 shrink-0" />
      <span>{{ t('page.tasks.settings.filters_moved') }}</span>
    </p>
    <PreferenceSettingGroups :groups="groups" test-id-prefix="task-setting">
      <template #after-group="{ group }">
        <div
          v-if="group.key === 'behavior' && failedTasksCount > 0"
          data-testid="task-settings-repair"
          class="bg-warning-500/8 border-warning-500/20 mx-2 mt-2 flex items-center justify-between gap-3 rounded-md border px-2.5 py-2"
        >
          <span class="text-surface-300 text-xs">
            {{
              t('page.tasks.settings.advanced.failed_tasks_summary', { count: failedTasksCount })
            }}
          </span>
          <UButton
            color="warning"
            variant="soft"
            size="xs"
            icon="i-mdi-wrench"
            @click="repairFailedTasks"
          >
            {{ t('page.tasks.settings.advanced.repair_failed_action') }}
          </UButton>
        </div>
      </template>
    </PreferenceSettingGroups>
    <UModal v-model:open="showRepairConfirm" @close="resolveRepairConfirm(false)">
      <template #content>
        <div class="p-5">
          <div class="mb-4 flex items-center gap-3">
            <div class="bg-warning-500/15 rounded-full p-2">
              <UIcon name="i-mdi-alert" class="text-warning-400 h-5 w-5" />
            </div>
            <h3 class="text-surface-100 text-base font-semibold">
              {{ t('page.tasks.settings.advanced.repair_failed') }}
            </h3>
          </div>
          <p class="text-surface-300 mb-5 text-sm">
            {{ t('page.tasks.settings.advanced.repair_failed_confirm') }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="resolveRepairConfirm(false)">
              {{ t('common.cancel') }}
            </UButton>
            <UButton color="warning" variant="soft" @click="resolveRepairConfirm(true)">
              {{ t('page.tasks.settings.advanced.repair_failed_action') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </SettingsDrawer>
</template>
<script setup lang="ts">
  import PreferenceSettingGroups from '@/components/ui/PreferenceSettingGroups.vue';
  import SettingsDrawer from '@/components/ui/SettingsDrawer.vue';
  import { useTaskRepair } from '@/composables/useTaskRepair';
  import { useTaskDisplaySettings } from '@/features/tasks/composables/useTaskDisplaySettings';
  withDefaults(defineProps<{ mode?: 'overlay' | 'docked' }>(), {
    mode: 'overlay',
  });
  const { t } = useI18n({ useScope: 'global' });
  const showRepairConfirm = ref(false);
  const repairConfirmResolver = ref<((value: boolean) => void) | null>(null);
  const requestRepairConfirm = () =>
    new Promise<boolean>((resolve) => {
      repairConfirmResolver.value = resolve;
      showRepairConfirm.value = true;
    });
  const resolveRepairConfirm = (confirmed: boolean) => {
    const resolver = repairConfirmResolver.value;
    repairConfirmResolver.value = null;
    showRepairConfirm.value = false;
    if (resolver) {
      resolver(confirmed);
    }
  };
  const { failedTasksCount, repairFailedTasks } = useTaskRepair({ requestRepairConfirm });
  onBeforeUnmount(() => {
    resolveRepairConfirm(false);
  });
  const { groups } = useTaskDisplaySettings();
</script>
