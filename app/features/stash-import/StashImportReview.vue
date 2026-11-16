<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-surface-200 text-sm" aria-live="polite">
        <span class="text-surface-50 font-semibold">
          {{ $t('stash_import.found_count', { count: includedCount }) }}
        </span>
        <span class="ms-1" :class="progress.tone">· {{ progress.text }}</span>
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <div
          class="bg-surface-950 flex rounded-md p-0.5"
          role="group"
          :aria-label="$t('stash_import.filter_label')"
        >
          <button
            v-for="option in filterOptions"
            :key="option.value"
            type="button"
            class="rounded px-2.5 py-1 text-xs transition-colors"
            :class="option.tone"
            :aria-pressed="option.active"
            @click="filter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-mdi-check-decagram-outline"
          :disabled="!includedCount"
          @click="allFir = !allFir"
        >
          {{ $t('stash_import.set_fir') }}
        </UButton>
      </div>
    </div>
    <div
      v-if="allFir"
      class="border-warning-400/40 bg-warning-500/10 text-surface-200 flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
    >
      <p class="min-w-0 flex-1">{{ $t('stash_import.set_fir_confirm') }}</p>
      <div class="flex gap-2">
        <UButton size="xs" @click="markFir">{{ $t('stash_import.set_fir_yes') }}</UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="allFir = false">
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </div>
    <ul class="min-h-0 space-y-1.5 lg:overflow-y-auto lg:pr-1">
      <li
        v-for="row in visibleRows"
        :key="row.cell.key"
        :ref="(element) => track(row.cell.key, element)"
      >
        <StashReviewRow
          :row="row"
          :items="result.catalog.items"
          :open="row.cell.key === activeKey"
          :bitmap="bitmap"
          :tracked="tracked"
          :item-name="itemName"
          @toggle="toggle(row.cell.key)"
          @next="$emit('next')"
          @split="(columns, rows) => $emit('split', columns, rows)"
          @change="$emit('change', $event)"
        />
      </li>
      <li v-if="!visibleRows.length" class="text-surface-400 px-2 py-6 text-center text-sm">
        {{ $t(emptyKey) }}
      </li>
      <template v-if="skippedRows.length">
        <li class="text-surface-400 px-1 pt-2 text-xs font-semibold tracking-wide uppercase">
          {{ $t('stash_import.skip_heading', { count: skippedRows.length }) }}
        </li>
        <li
          v-for="row in skippedRows"
          :key="row.cell.key"
          :ref="(element) => track(row.cell.key, element)"
        >
          <StashReviewRow
            :row="row"
            :items="result.catalog.items"
            :open="row.cell.key === activeKey"
            :bitmap="bitmap"
            :tracked="tracked"
            :item-name="itemName"
            @toggle="toggle(row.cell.key)"
            @next="$emit('next')"
            @split="(columns, rows) => $emit('split', columns, rows)"
            @change="$emit('change', $event)"
          />
        </li>
      </template>
    </ul>
    <details class="text-surface-400 text-xs">
      <summary class="cursor-pointer">{{ $t('stash_import.coverage') }}</summary>
      <p class="mt-1">{{ $t('stash_import.match_help') }}</p>
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
  import StashReviewRow from '@/features/stash-import/StashReviewRow.vue';
  import { blocksImport, reviewState } from '@/utils/stashScan/review';
  import type { ReviewedCell, ScanResult } from '@/utils/stashScan/types';
  const props = defineProps<{
    result: ScanResult;
    rows: ReviewedCell[];
    tracked?: ReadonlySet<string>;
    remaining: number;
    bitmap?: ImageBitmap;
    itemName: (id: string) => string;
  }>();
  const emit = defineEmits<{
    next: [];
    split: [columns: number, rows: number];
    change: [patch: Partial<ReviewedCell>];
    markFir: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const activeKey = defineModel<number>('activeKey');
  type Filter = 'check' | 'all';
  const filter = ref<Filter>(props.remaining ? 'check' : 'all');
  const allFir = ref(false);
  const includedCount = computed(() => props.rows.filter((row) => !row.excluded).length);
  /** What the All filter lists: every detection except empty slots nobody restored. */
  const listed = (row: ReviewedCell) => !row.cell.empty || !row.excluded;
  const listedCount = computed(() => props.rows.filter(listed).length);
  const progress = computed(() =>
    props.remaining
      ? {
          tone: 'text-warning-300',
          text: t('stash_import.review_count', { count: props.remaining }),
        }
      : { tone: 'text-success-300', text: t('stash_import.all_checked') }
  );
  const filterOptions = computed(() =>
    (['check', 'all'] as const).map((value) => ({
      value,
      active: filter.value === value,
      label: t(`stash_import.filter_${value}`, {
        count: value === 'check' ? props.remaining : listedCount.value,
      }),
      tone:
        filter.value === value
          ? 'bg-surface-700 text-surface-50 font-semibold'
          : 'text-surface-400 hover:text-surface-200',
    }))
  );
  const emptyKey = computed(() =>
    filter.value === 'check' ? 'stash_import.nothing_to_check' : 'stash_import.nothing_found'
  );
  const skipped = (row: ReviewedCell) => reviewState(row, props.tracked) === 'skip';
  /** Empty slots stay hidden; the open row stays visible while it is being corrected. */
  function visible(row: ReviewedCell) {
    if (filter.value === 'check') {
      if (row.cell.key === activeKey.value) return !skipped(row);
      return blocksImport(row);
    }
    return row.cell.key === activeKey.value || listed(row);
  }
  const visibleRows = computed(() => props.rows.filter(visible));
  /**
   * Only settled, unneeded items belong in this group. Every incomplete row stays
   * in the main list, regardless of its candidate shortlist.
   */
  const skippedRows = computed(() => (filter.value === 'check' ? props.rows.filter(skipped) : []));
  function toggle(key: number) {
    activeKey.value = key === activeKey.value ? undefined : key;
  }
  const elements = new Map<number, Element>();
  function track(key: number, element: unknown) {
    if (element instanceof Element) elements.set(key, element);
    else elements.delete(key);
  }
  watch(activeKey, async (key) => {
    if (key === undefined) return;
    await nextTick();
    elements.get(key)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
  function markFir() {
    allFir.value = false;
    emit('markFir');
  }
</script>
