<template>
  <GenericCard icon="mdi-database-import-outline" icon-color="white">
    <template #title>{{ t('settings.data_migration.title') }}</template>
    <template #content>
      <p class="mb-4">{{ t('settings.data_migration.description') }}</p>
      <div class="bg-surface-800 mb-3 rounded-lg p-4">
        <MigrationSteps />
        <form @submit.prevent="void migration.fetchWithApiToken()">
          <UInput
            v-model="migration.apiToken.value"
            :label="t('settings.data_migration.api_token_label')"
            :placeholder="t('settings.data_migration.api_token_placeholder')"
            :disabled="migration.fetchingApi?.value"
            :error="!!migration.apiError?.value"
            class="mb-4"
            :type="migration.showToken?.value ? 'text' : 'password'"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-mdi-eye"
                :padded="false"
                @click="
                  migration.showToken && (migration.showToken.value = !migration.showToken.value)
                "
              />
            </template>
          </UInput>
          <div class="flex items-center justify-between">
            <div v-if="migration.fetchingApi?.value" class="flex items-center">
              <UIcon name="i-mdi-loading" class="text-primary mr-2 h-6 w-6 animate-spin" />
              <span>{{ t('settings.data_migration.fetching') }}</span>
            </div>
            <UAlert
              v-else-if="migration.apiFetchSuccess?.value"
              color="success"
              variant="soft"
              class="mt-0 mr-4 mb-0 grow"
              :title="t('settings.data_migration.ready')"
            />
            <div v-else class="grow"></div>
            <UButton
              color="primary"
              :loading="migration.fetchingApi?.value"
              :disabled="!migration.apiToken?.value || migration.fetchingApi?.value"
              class="px-4"
              @click="void migration.fetchWithApiToken()"
            >
              {{ t('settings.data_migration.fetch_button') }}
            </UButton>
          </div>
        </form>
      </div>
      <ImportConfirmDialog
        v-model:show="migration.confirmDialog.value"
        :data="migration.importedData.value ?? undefined"
        :completed-tasks="migration.countCompletedTasks.value"
        :failed-tasks="migration.countFailedTasks.value"
        :task-objectives="migration.countTaskObjectives.value"
        :hideout-modules="migration.countHideoutModules.value"
        :hideout-parts="migration.countHideoutParts.value"
        :importing="migration.importing.value"
        @confirm="migration.confirmImport"
        @show-objectives-details="migration.showObjectivesDetails.value = true"
        @show-failed-tasks-details="migration.showFailedTaskDetails.value = true"
      />
      <UModal v-model:open="migration.showObjectivesDetails.value">
        <template #header>
          <div class="text-xl font-medium">
            {{ t('settings.data_migration.objectives_modal_title') }}
          </div>
        </template>
        <template #body>
          <div class="space-y-3">
            <p>
              {{
                t('settings.data_migration.objectives_modal_count', {
                  count: migration.countTaskObjectives.value,
                })
              }}
            </p>
            <p>{{ t('settings.data_migration.objectives_modal_dashboard') }}</p>
            <p>{{ t('settings.data_migration.objectives_modal_normal') }}</p>
          </div>
        </template>
        <template #footer="{ close }">
          <div class="flex justify-end">
            <UButton color="primary" variant="solid" @click="close">
              {{ t('settings.data_migration.close') }}
            </UButton>
          </div>
        </template>
      </UModal>
      <UModal v-model:open="migration.showFailedTaskDetails.value">
        <template #header>
          <div class="text-xl font-medium">
            {{ t('settings.data_migration.failed_modal_title') }}
          </div>
        </template>
        <template #body>
          <div class="space-y-3">
            <p>{{ t('settings.data_migration.failed_modal_description') }}</p>
            <div class="mt-2 space-y-2">
              <div
                v-for="task in migration.failedTasks.value"
                :key="task.id"
                class="border-surface-700 border-b pb-2 last:border-0"
              >
                <div class="flex items-center">
                  <span>
                    {{ t('settings.data_migration.failed_modal_task_id', { id: task.id }) }}
                  </span>
                  <UBadge size="xs" color="error" class="ml-2">
                    {{ t('settings.data_migration.failed_badge') }}
                  </UBadge>
                </div>
                <div class="text-surface-400 text-sm">
                  {{ t('settings.data_migration.failed_modal_task_status') }}
                </div>
              </div>
            </div>
            <p>
              <strong>{{ t('common.note') }}:</strong>
              {{ t('settings.data_migration.failed_modal_note') }}
            </p>
          </div>
        </template>
        <template #footer="{ close }">
          <div class="flex justify-end">
            <UButton color="primary" variant="solid" @click="close">
              {{ t('settings.data_migration.close') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useDataMigration } from '@/composables/useDataMigration';
  import ImportConfirmDialog from '@/features/settings/ImportConfirmDialog.vue';
  import MigrationSteps from '@/features/settings/MigrationSteps.vue';
  const { t } = useI18n({ useScope: 'global' });
  const migration = useDataMigration();
</script>
