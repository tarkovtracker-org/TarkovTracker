<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-semibold">
        {{ $t('stash_import.review_count', { count: remaining }) }}
      </h3>
      <UButton v-if="remaining" size="sm" variant="soft" @click="$emit('next')">
        {{ $t('stash_import.next_review') }}
      </UButton>
    </div>
    <StashCellEditor
      v-if="active"
      :row="active"
      :items="result.catalog.items"
      @next="$emit('next')"
      @split="(columns, rows) => $emit('split', columns, rows)"
      @change="$emit('change', $event)"
    />
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-sm">
        <input v-model="onlyAttention" type="checkbox" class="mr-2" />
        {{ $t('stash_import.only_attention') }}
      </label>
      <UButton size="xs" variant="soft" @click="allFir = !allFir">
        {{ $t('stash_import.set_fir') }}
      </UButton>
    </div>
    <div v-if="allFir" class="border-warning-400/30 rounded border p-3 text-sm">
      <p>{{ $t('stash_import.set_fir_confirm') }}</p>
      <div class="mt-2 flex gap-2">
        <UButton
          size="xs"
          @click="
            allFir = false;
            $emit('markFir');
          "
        >
          {{ $t('stash_import.set_fir_yes') }}
        </UButton>
        <UButton size="xs" variant="ghost" @click="allFir = false">
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </div>
    <div class="max-h-72 overflow-y-auto rounded border border-white/10">
      <button
        v-for="row in visibleRows"
        :key="row.cell.key"
        type="button"
        class="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/5"
        :class="row.cell.key === activeKey ? 'bg-primary-500/10' : ''"
        @click="activeKey = row.cell.key"
      >
        <span :class="row.excluded ? 'text-surface-500 line-through' : ''">
          {{ itemName(row.itemId) }}
        </span>
        <span class="shrink-0" :class="needsReview(row) ? 'text-warning-300' : 'text-surface-300'">
          {{ row.quantity ?? '?' }} · {{ $t(`stash_import.${row.raidStatus}`) }}
        </span>
      </button>
    </div>
    <p class="text-surface-400 text-xs">{{ $t('stash_import.match_help') }}</p>
    <details class="text-surface-400 text-xs">
      <summary class="cursor-pointer">{{ $t('stash_import.coverage') }}</summary>
      <p class="mt-1">
        {{ $t('stash_import.coverage_detail', { count: result.catalog.missing.length }) }}
      </p>
      <p class="mt-1">{{ $t('stash_import.coverage_limits') }}</p>
      <a
        href="/licenses/cultist-circle.txt"
        target="_blank"
        rel="noopener"
        class="text-link underline"
      >
        {{ $t('stash_import.attribution') }}
      </a>
    </details>
  </div>
</template>
<script setup lang="ts">
  import StashCellEditor from '@/features/stash-import/StashCellEditor.vue';
  import { needsReview } from '@/utils/stashScan/review';
  import type { ReviewedCell, ScanResult } from '@/utils/stashScan/types';
  const props = defineProps<{
    result: ScanResult;
    rows: ReviewedCell[];
    remaining: number;
    active?: ReviewedCell;
    itemName: (id: string) => string;
  }>();
  const activeKey = defineModel<number>('activeKey');
  const onlyAttention = ref(false);
  const allFir = ref(false);
  const visibleRows = computed(() =>
    onlyAttention.value
      ? props.rows.filter(needsReview)
      : props.rows.filter((row) => !row.cell.empty || !row.excluded)
  );
  defineEmits<{
    next: [];
    split: [columns: number, rows: number];
    change: [patch: Partial<ReviewedCell>];
    markFir: [];
  }>();
</script>
