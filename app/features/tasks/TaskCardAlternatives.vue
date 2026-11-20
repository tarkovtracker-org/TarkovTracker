<template>
  <div
    v-if="alternativeGroups.length"
    data-testid="task-alternatives"
    class="border-warning-500/25 bg-warning-500/5 rounded-md border px-2.5 py-2 text-xs"
  >
    <div class="text-warning-200 flex items-center gap-1.5 font-semibold">
      <UIcon name="i-mdi-swap-horizontal" class="h-4 w-4 shrink-0" aria-hidden="true" />
      {{ t('page.tasks.questcard.quest_alternatives') }}
    </div>
    <ul class="mt-1 space-y-1.5">
      <li v-for="group in alternativeGroups" :key="group.label">
        <p class="text-surface-300">{{ group.label }}</p>
        <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <router-link
            v-for="alternative in group.tasks"
            :key="alternative.id"
            :to="{ path: '/tasks', query: { task: alternative.id } }"
            class="text-link hover:text-link-hover focus-visible:ring-primary-500 block min-h-6 max-w-full content-center rounded-sm font-medium wrap-anywhere underline underline-offset-2 focus-visible:ring-2"
          >
            {{ alternative.name }}
          </router-link>
        </div>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  const props = defineProps<{ taskId: string }>();
  const metadataStore = useMetadataStore();
  const { t } = useI18n({ useScope: 'global' });
  const alternativeGroups = computed(() => {
    const id = props.taskId;
    const targets = new Set(metadataStore.alternativeTasks[id]);
    const sources = new Set(metadataStore.alternativeTaskSources[id]);
    if (!targets.size && !sources.size) return [];
    const resolveTasks = (ids: string[]) =>
      ids.flatMap((taskId) => {
        const task = metadataStore.getTaskById(taskId);
        return task?.name ? [task] : [];
      });
    return [
      {
        label: t('page.tasks.questcard.alternatives_mutual'),
        tasks: resolveTasks([...targets].filter((taskId) => sources.has(taskId))),
      },
      {
        label: t('page.tasks.questcard.alternatives_failed_by_this'),
        tasks: resolveTasks([...targets].filter((taskId) => !sources.has(taskId))),
      },
      {
        label: t('page.tasks.questcard.alternatives_fail_this'),
        tasks: resolveTasks([...sources].filter((taskId) => !targets.has(taskId))),
      },
    ].filter((group) => group.tasks.length > 0);
  });
</script>
