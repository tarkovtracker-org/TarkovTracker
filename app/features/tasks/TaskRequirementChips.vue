<template>
  <div
    v-if="rows.length"
    class="flex flex-col gap-1 text-xs"
    data-testid="task-requirements-blocking"
  >
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
        {{ t('common.requires') }}
      </span>
      <component
        :is="chip.tag"
        v-for="chip in chips"
        :key="chip.key"
        :to="chip.to"
        class="bg-surface-800/80 text-surface-200 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 leading-tight"
        :class="chip.wrapperClass"
        data-testid="task-requirement-chip"
      >
        <UIcon :name="chip.icon" aria-hidden="true" class="text-error-400 h-3.5 w-3.5 shrink-0" />
        <span class="flex min-w-0 items-center gap-1" :class="chip.contentClass">
          <span class="min-w-0" :class="chip.labelClass">{{ chip.label }}</span>
          <span v-if="chip.progress" class="text-surface-400 shrink-0">· {{ chip.progress }}</span>
          <button
            v-if="chip.pool"
            type="button"
            class="text-primary-400 focus-visible:ring-primary-500/40 rounded underline underline-offset-2 focus-visible:ring-2"
            @click="emit('showPool', chip.pool.id)"
          >
            {{ t('page.tasks.requirements.pool_show_tasks') }}
          </button>
        </span>
      </component>
      <button
        v-if="toggleLabel"
        type="button"
        class="text-surface-400 hover:text-surface-200 focus-visible:ring-primary-500/40 rounded px-1 focus:outline-none focus-visible:ring-2"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ toggleLabel }}
      </button>
    </div>
    <p
      v-for="hint in hints"
      :key="hint"
      class="light:text-warning-900 flex items-start gap-1 text-[11px] text-amber-400/80"
    >
      <UIcon name="i-mdi-information-outline" aria-hidden="true" class="mt-0.5 h-3 w-3 shrink-0" />
      <span>{{ hint }}</span>
    </p>
  </div>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import type {
    TaskRequirementKind,
    TaskRequirementRow,
  } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{ rows: TaskRequirementRow[] }>();
  const emit = defineEmits<{ showPool: [id: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const MAX_VISIBLE = 3;
  const KIND_ICONS: Record<TaskRequirementKind, string> = {
    player_level: 'i-mdi-account-star',
    trader_level: 'i-mdi-handshake',
    trader_reputation: 'i-mdi-handshake',
    task: 'i-mdi-clipboard-check-outline',
    task_pool: 'i-mdi-clipboard-list-outline',
    other: 'i-mdi-lock-outline',
  };
  const LINK_CLASS = 'hover:bg-surface-700 underline-offset-2 hover:underline';
  const expanded = ref(false);
  const hiddenCount = computed(() => Math.max(0, props.rows.length - MAX_VISIBLE));
  const chips = computed(() =>
    (expanded.value ? props.rows : props.rows.slice(0, MAX_VISIBLE)).map((row, index) => ({
      ...row,
      key: `${row.kind}-${index}-${row.label}`,
      tag: row.to ? RouterLink : 'span',
      wrapperClass: row.to ? LINK_CLASS : '',
      contentClass: row.pool ? 'flex-wrap' : '',
      labelClass: row.pool ? 'break-words' : 'truncate',
      icon: KIND_ICONS[row.kind],
    }))
  );
  const toggleLabel = computed(() => {
    if (expanded.value && hiddenCount.value > 0) return t('page.tasks.requirements.show_less');
    return hiddenCount.value > 0
      ? t('page.tasks.requirements.show_more', { count: hiddenCount.value })
      : '';
  });
  const hints = computed(() => [
    ...new Set(chips.value.map((row) => row.hint).filter((hint): hint is string => !!hint)),
  ]);
</script>
