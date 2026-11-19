<template>
  <section
    class="bg-surface-850 shrink-0 rounded-md border p-3"
    :class="ready ? 'border-success-400/30' : 'border-surface-700'"
    :aria-labelledby="headingId"
    data-testid="stash-sell-advice"
  >
    <h3 :id="headingId" class="text-surface-50 flex items-center gap-2 text-sm font-semibold">
      <UIcon
        name="i-mdi-hand-coin-outline"
        class="size-5"
        :class="ready ? 'text-success-300' : 'text-surface-400'"
        aria-hidden="true"
      />
      {{ $t('stash_import.sell_heading') }}
    </h3>
    <p class="text-surface-300 mt-1 text-xs" aria-live="polite">
      {{ summary }}
    </p>
    <p v-if="incompleteTasks?.length" class="text-surface-400 mt-1 text-xs">
      {{
        $t('stash_import.sell_incomplete_tasks', { tasks: incompleteTasks.slice(0, 3).join(', ') })
      }}
    </p>
    <ul
      v-if="ready && groups.length"
      class="mt-2 grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2"
    >
      <li
        v-for="group in groups"
        :key="group.itemId"
        class="bg-surface-950 flex min-w-0 items-center gap-2 rounded p-2"
      >
        <StashCellThumb class="size-10" :bitmap="bitmap" :cell="group.cell" />
        <div class="min-w-0">
          <p class="text-surface-100 text-xs font-medium break-words">{{ group.name }}</p>
          <p class="text-surface-400 text-xs">
            {{ $t('stash_import.units', { count: group.quantity }) }}
          </p>
        </div>
      </li>
    </ul>
    <p v-else-if="ready" class="text-surface-300 mt-2 text-xs">
      {{ $t('stash_import.sell_empty') }}
    </p>
    <p class="text-surface-400 mt-2 text-xs">
      {{ $t('stash_import.sell_scope', { mode: modeLabel }) }}
    </p>
  </section>
</template>
<script setup lang="ts">
  import StashCellThumb from '@/features/stash-import/StashCellThumb.vue';
  import type { SellGroup } from '@/features/stash-import/sellAdvice';
  const props = defineProps<{
    groups: SellGroup[];
    ready: boolean;
    incompleteTasks?: string[];
    modeLabel: string;
    bitmap?: ImageBitmap;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const summary = computed(() => {
    if (props.ready) return t('stash_import.sell_summary', { count: props.groups.length });
    if (props.incompleteTasks?.length)
      return t('stash_import.sell_incomplete', { count: props.incompleteTasks.length });
    return t('stash_import.sell_unavailable');
  });
  const headingId = useId();
</script>
