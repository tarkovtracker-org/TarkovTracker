<template>
  <form class="space-y-4" @submit.prevent>
    <div class="space-y-1">
      <h3 class="text-surface-100 text-sm font-semibold">{{ $t('setup.quest_title') }}</h3>
      <p class="text-surface-400 text-xs">{{ $t('setup.quest_help') }}</p>
    </div>
    <div class="flex flex-wrap gap-1.5" role="group" :aria-label="$t('setup.trader_filter_label')">
      <UButton
        v-for="chip in traderChips"
        :key="chip.key"
        type="button"
        size="xs"
        :color="chip.color"
        :variant="chip.variant"
        @click="selectedTraderId = chip.id"
      >
        {{ chip.label }}
      </UButton>
    </div>
    <UFormField :label="$t('setup.quest_search')">
      <UInput
        ref="questSearch"
        v-model="query"
        class="w-full"
        icon="i-mdi-magnify"
        type="search"
        :placeholder="$t('setup.quest_search_placeholder')"
        :disabled="saving"
      />
    </UFormField>
    <p v-if="showNoMatches" class="text-surface-400 text-sm">
      {{ $t('setup.quest_no_matches') }}
    </p>
    <ul
      v-if="matchRows.length"
      class="bg-surface-950/55 divide-surface-800 divide-y rounded-lg border border-white/8"
    >
      <li
        v-for="row in matchRows"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
      >
        <span class="min-w-0 flex-1">
          <span class="text-surface-100 block text-sm font-medium">{{ row.name }}</span>
          <span class="text-surface-400 block text-xs">{{ row.subtitle }}</span>
        </span>
        <div class="flex shrink-0 items-center gap-1.5">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            :disabled="saving"
            :aria-label="row.activeAriaLabel"
            @click="chooseTask(row.id, 'active')"
          >
            {{ $t('setup.quest_active') }}
          </UButton>
          <UButton
            size="xs"
            color="success"
            variant="soft"
            :disabled="saving"
            :aria-label="row.completedAriaLabel"
            @click="chooseTask(row.id, 'completed')"
          >
            {{ $t('setup.quest_completed') }}
          </UButton>
        </div>
      </li>
    </ul>
    <div v-if="selectedRows.length" class="space-y-2">
      <p class="text-surface-300 text-xs font-semibold uppercase">
        {{ $t('setup.selected_quests_heading', { count: selectedRows.length }) }}
      </p>
      <ul class="bg-surface-950/60 divide-surface-800 divide-y rounded-lg border border-white/10">
        <li
          v-for="row in selectedRows"
          :key="row.id"
          class="flex flex-wrap items-center gap-2 px-3 py-2"
        >
          <span class="text-surface-100 min-w-0 flex-1 text-sm font-medium">{{ row.name }}</span>
          <USelect
            :model-value="row.status"
            :items="questStatuses"
            size="xs"
            :aria-label="row.statusAriaLabel"
            :disabled="saving"
            @update:model-value="emit('change', row.id, $event)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-mdi-close"
            :aria-label="row.removeAriaLabel"
            :disabled="saving"
            @click="emit('remove', row.id)"
          />
        </li>
      </ul>
    </div>
    <div
      v-if="suggestedRows.length"
      class="bg-info-500/8 border-info-500/25 space-y-2 rounded-lg border p-3.5"
    >
      <UCheckbox
        v-model="includePrerequisites"
        :label="$t('setup.include_prerequisites_count', { count: suggestedRows.length })"
        :disabled="saving"
      />
      <details class="text-surface-300 text-xs">
        <summary class="text-info-300 hover:text-info-200 cursor-pointer font-medium">
          {{ $t('setup.review_prerequisites', { count: suggestedRows.length }) }}
        </summary>
        <ul class="mt-2 grid list-inside list-disc gap-1 sm:grid-cols-2">
          <li v-for="item in suggestedRows" :key="item.id">{{ item.name }}</li>
        </ul>
      </details>
    </div>
    <p class="text-surface-400 flex items-start gap-2 text-xs">
      <UIcon name="i-mdi-lightbulb-on-outline" class="text-primary-400 mt-0.5 size-4 shrink-0" />
      <span>{{ $t('setup.quest_mark_available_tip') }}</span>
    </p>
  </form>
</template>
<script setup lang="ts">
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { Task } from '@/types/tarkov';
  type Selection = 'active' | 'completed';
  type TraderOption = { id: string; name: string };
  const props = defineProps<{
    choices: ReadonlyMap<string, Selection>;
    tasks: ReadonlyMap<string, Task>;
    traders: readonly TraderOption[];
    suggested: readonly string[];
    saving: boolean;
  }>();
  const emit = defineEmits<{ change: [id: string, status: Selection]; remove: [id: string] }>();
  const includePrerequisites = defineModel<boolean>('includePrerequisites', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const tarkov = useTarkovStore();
  const query = ref('');
  const selectedTraderId = ref<string | null>(null);
  const questSearch = useTemplateRef<{ inputRef?: HTMLInputElement }>('questSearch');
  const questStatuses = computed(() => [
    { label: t('setup.quest_active'), value: 'active' as const },
    { label: t('setup.quest_completed'), value: 'completed' as const },
  ]);
  const traderChips = computed(() => {
    const entries: Array<{ id: string | null; key: string; label: string }> = [
      { id: null, key: 'all', label: t('common.all') },
      ...props.traders.map((trader) => ({ id: trader.id, key: trader.id, label: trader.name })),
    ];
    return entries.map((entry) => {
      const active = selectedTraderId.value === entry.id;
      return {
        ...entry,
        color: (active ? 'primary' : 'neutral') as 'primary' | 'neutral',
        variant: (active ? 'solid' : 'soft') as 'solid' | 'soft',
      };
    });
  });
  const canSelect = (id: string) =>
    !props.choices.has(id) && !tarkov.isTaskComplete(id) && !tarkov.isTaskFailed(id);
  function matchesTrader(task: Task, traderFilter: string | null): boolean {
    return !traderFilter || task.trader?.id === traderFilter;
  }
  function matchesText(task: Task, term: string): boolean {
    if (!term) return true;
    return [task.trader?.name, task.name].join(' ').toLocaleLowerCase().includes(term);
  }
  function matchesFilter(task: Task, term: string, traderFilter: string | null): boolean {
    return canSelect(task.id) && matchesTrader(task, traderFilter) && matchesText(task, term);
  }
  const matches = computed(() => {
    const term = query.value.trim().toLocaleLowerCase();
    const traderFilter = selectedTraderId.value;
    if (!term && !traderFilter) return [];
    return [...props.tasks.values()]
      .filter((task) => matchesFilter(task, term, traderFilter))
      .sort((a, b) => (a.minPlayerLevel ?? 0) - (b.minPlayerLevel ?? 0))
      .slice(0, 10);
  });
  const showNoMatches = computed(
    () => Boolean(query.value.trim() || selectedTraderId.value) && matches.value.length === 0
  );
  const matchRows = computed(() =>
    matches.value.map((task) => {
      const name = task.name ?? task.id;
      const parts = [
        task.trader?.name,
        task.minPlayerLevel ? `${t('common.lv')} ${task.minPlayerLevel}` : '',
      ].filter(Boolean);
      return {
        id: task.id,
        name,
        subtitle: parts.join(' · '),
        activeAriaLabel: t('setup.add_quest_active_label', { quest: name }),
        completedAriaLabel: t('setup.add_quest_completed_label', { quest: name }),
      };
    })
  );
  const selectedRows = computed(() =>
    [...props.choices.entries()].map(([id, status]) => {
      const name = props.tasks.get(id)?.name ?? id;
      return {
        id,
        name,
        status,
        statusAriaLabel: t('setup.quest_status_label', { quest: name }),
        removeAriaLabel: t('setup.remove_quest_label', { quest: name }),
      };
    })
  );
  const suggestedRows = computed(() =>
    props.suggested.map((id) => ({ id, name: props.tasks.get(id)?.name ?? id }))
  );
  function chooseTask(id: string, status: Selection) {
    emit('change', id, status);
    query.value = '';
    void nextTick(() => questSearch.value?.inputRef?.focus());
  }
</script>
