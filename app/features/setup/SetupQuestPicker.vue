<template>
  <form class="border-surface-700 space-y-3 rounded-lg border p-4" @submit.prevent>
    <h3 class="font-semibold">{{ $t('setup.quest_title') }}</h3>
    <p class="text-surface-400 text-sm">{{ $t('setup.quest_help') }}</p>
    <UFormField :label="$t('setup.quest_search')">
      <UInput
        ref="questSearch"
        v-model="query"
        class="w-full"
        icon="i-mdi-magnify"
        type="search"
        :disabled="saving"
      />
    </UFormField>
    <p v-if="query.trim() && !matches.length" class="text-surface-400 text-sm">
      {{ $t('setup.quest_no_matches') }}
    </p>
    <ul v-if="matches.length" class="divide-surface-700 divide-y">
      <li
        v-for="task in matches"
        :key="task.id"
        class="flex flex-wrap items-center justify-between gap-2 py-2"
      >
        <span class="min-w-0">
          <span class="block text-sm font-medium">{{ task.name }}</span>
          <span class="text-surface-400 block text-xs">{{ task.trader?.name }}</span>
        </span>
        <UButton
          size="xs"
          variant="soft"
          :disabled="saving"
          :aria-label="$t('setup.add_quest_label', { quest: task.name })"
          @click="chooseTask(task.id)"
        >
          {{ $t('setup.add_quest') }}
        </UButton>
      </li>
    </ul>
    <ul v-if="choices.size" class="divide-surface-700 divide-y">
      <li v-for="[id, status] in choices" :key="id" class="flex flex-wrap items-center gap-2 py-2">
        <span class="min-w-0 flex-1 text-sm">{{ tasks.get(id)?.name }}</span>
        <USelect
          :model-value="status"
          :items="questStatuses"
          :aria-label="$t('setup.quest_status_label', { quest: tasks.get(id)?.name })"
          :disabled="saving"
          @update:model-value="emit('change', id, $event)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-mdi-close"
          :aria-label="$t('setup.remove_quest_label', { quest: tasks.get(id)?.name })"
          :disabled="saving"
          @click="emit('remove', id)"
        />
      </li>
    </ul>
    <div v-if="suggested.length" class="border-surface-700 space-y-2 rounded-md border p-3">
      <UCheckbox
        v-model="includePrerequisites"
        :label="$t('setup.include_prerequisites')"
        :disabled="saving"
      />
      <details class="text-surface-400 text-sm">
        <summary class="cursor-pointer">
          {{ $t('setup.review_prerequisites', { count: suggested.length }) }}
        </summary>
        <ul class="list-inside list-disc pt-2">
          <li v-for="id in suggested" :key="id">{{ tasks.get(id)?.name }}</li>
        </ul>
      </details>
    </div>
  </form>
</template>
<script setup lang="ts">
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { Task } from '@/types/tarkov';
  type Selection = 'active' | 'completed';
  const props = defineProps<{
    choices: ReadonlyMap<string, Selection>;
    tasks: ReadonlyMap<string, Task>;
    suggested: readonly string[];
    saving: boolean;
  }>();
  const emit = defineEmits<{ change: [id: string, status: Selection]; remove: [id: string] }>();
  const includePrerequisites = defineModel<boolean>('includePrerequisites', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const tarkov = useTarkovStore();
  const query = ref('');
  const questSearch = useTemplateRef<{ inputRef?: HTMLInputElement }>('questSearch');
  const questStatuses = computed(() => [
    { label: t('setup.quest_active'), value: 'active' as const },
    { label: t('setup.quest_completed'), value: 'completed' as const },
  ]);
  const canSelect = (id: string) =>
    !props.choices.has(id) && !tarkov.isTaskComplete(id) && !tarkov.isTaskFailed(id);
  const matches = computed(() => {
    const term = query.value.trim().toLocaleLowerCase();
    if (!term) return [];
    return [...props.tasks.values()]
      .filter((task) => {
        return (
          canSelect(task.id) &&
          [task.trader?.name, task.name].join(' ').toLocaleLowerCase().includes(term)
        );
      })
      .slice(0, 8);
  });
  function chooseTask(id: string) {
    emit('change', id, 'active');
    query.value = '';
    void nextTick(() => questSearch.value?.inputRef?.focus());
  }
</script>
