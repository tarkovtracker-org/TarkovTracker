<template>
  <div class="space-y-4">
    <StashCellCompare
      :row="row"
      :bitmap="bitmap"
      :item-name="selectedName"
      :reference="reference"
    />
    <div class="space-y-2">
      <p class="text-surface-300 text-xs font-semibold tracking-wide uppercase">
        {{ $t('stash_import.which_item') }}
      </p>
      <div class="relative">
        <UIcon
          name="i-mdi-magnify"
          class="text-surface-400 pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <input
          v-model="search"
          type="search"
          class="bg-surface-950 border-surface-600 focus:border-primary-400 w-full rounded-md border py-2 pr-2 pl-8 text-sm outline-none"
          :placeholder="$t('stash_import.search_item')"
          :aria-label="$t('stash_import.search_item')"
        />
      </div>
      <div
        class="max-h-44 space-y-1 overflow-y-auto"
        role="group"
        :aria-label="$t('stash_import.matches')"
      >
        <StashItemChoice
          v-for="item in choices"
          :key="item.id"
          :item="item"
          :selected="row.itemId === item.id"
          :icon="iconOf(item.id)"
          @choose="choose(item)"
        />
        <p v-if="!choices.length" class="text-surface-400 px-1 py-2 text-sm">
          {{ $t(search ? 'stash_import.no_search_results' : 'stash_import.no_suggestions') }}
        </p>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div v-if="stackable" class="space-y-2">
        <label
          :for="quantityId"
          class="text-surface-300 block text-xs font-semibold tracking-wide uppercase"
        >
          {{ $t('stash_import.quantity') }}
        </label>
        <input
          :id="quantityId"
          :value="row.quantity"
          type="number"
          min="1"
          :max="maxQuantity"
          step="1"
          inputmode="numeric"
          class="bg-surface-950 focus:border-primary-400 w-full rounded-md border px-3 py-2 text-sm outline-none"
          :class="row.quantity === null ? 'border-warning-400' : 'border-surface-600'"
          :placeholder="$t('stash_import.quantity_placeholder')"
          @input="setQuantity"
        />
        <p class="text-surface-400 text-xs">{{ $t('stash_import.stack_help') }}</p>
      </div>
      <fieldset class="space-y-2" :class="stackable ? '' : 'sm:col-span-2'">
        <legend class="text-surface-300 mb-2 text-xs font-semibold tracking-wide uppercase">
          {{ $t('stash_import.raid_status') }}
        </legend>
        <div class="bg-surface-950 grid grid-cols-3 gap-1 rounded-md p-1">
          <label
            v-for="status in statuses"
            :key="status"
            class="has-focus-visible:ring-primary-400 cursor-pointer rounded px-2 py-1.5 text-center text-xs transition-colors has-focus-visible:ring-2"
            :class="
              row.raidStatus === status
                ? 'bg-surface-700 text-surface-50 font-semibold'
                : 'text-surface-400 hover:text-surface-200'
            "
          >
            <input
              type="radio"
              class="sr-only"
              :name="`raid-status-${row.cell.key}`"
              :value="status"
              :checked="row.raidStatus === status"
              @change="setRaidStatus(status)"
            />
            {{ $t(`stash_import.raid_short_${status}`) }}
          </label>
        </div>
        <p class="text-surface-400 text-xs">{{ $t('stash_import.unknown_help') }}</p>
      </fieldset>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton icon="i-mdi-check" :disabled="!canConfirm" @click="confirm">
        {{ $t('stash_import.confirm_next') }}
      </UButton>
      <UButton variant="soft" color="neutral" icon="i-mdi-close" @click="exclude">
        {{ $t('stash_import.exclude') }}
      </UButton>
    </div>
    <details
      v-if="row.cell.slotsWide > 1 || row.cell.slotsHigh > 1"
      class="border-surface-700 rounded-md border p-3 text-sm"
    >
      <summary class="text-surface-300 cursor-pointer">{{ $t('stash_import.split') }}</summary>
      <p class="text-surface-400 mt-2 text-xs">{{ $t('stash_import.split_help') }}</p>
      <div class="mt-2 flex flex-wrap items-end gap-2">
        <label class="text-surface-300 text-xs">
          {{ $t('stash_import.columns') }}
          <input
            v-model.number="columns"
            type="number"
            min="1"
            :max="row.cell.slotsWide"
            class="bg-surface-950 border-surface-600 mt-1 block w-20 rounded-md border p-2 text-sm"
          />
        </label>
        <label class="text-surface-300 text-xs">
          {{ $t('stash_import.rows') }}
          <input
            v-model.number="rows"
            type="number"
            min="1"
            :max="row.cell.slotsHigh"
            class="bg-surface-950 border-surface-600 mt-1 block w-20 rounded-md border p-2 text-sm"
          />
        </label>
        <UButton
          variant="soft"
          color="neutral"
          :disabled="!canSplit"
          @click="$emit('split', columns, rows)"
        >
          {{ $t('stash_import.split_apply') }}
        </UButton>
      </div>
    </details>
  </div>
</template>
<script setup lang="ts">
  import StashCellCompare from '@/features/stash-import/StashCellCompare.vue';
  import StashItemChoice from '@/features/stash-import/StashItemChoice.vue';
  import { canSplitRegion } from '@/utils/stashScan/regions';
  import { selectItem } from '@/utils/stashScan/review';
  import {
    SCAN_LIMITS,
    type RaidStatus,
    type ReviewedCell,
    type ScanItem,
    type ScanItemImages,
  } from '@/utils/stashScan/types';
  const props = defineProps<{
    row: ReviewedCell;
    items: ScanItem[];
    bitmap?: ImageBitmap;
    imageFor?: (id: string) => ScanItemImages | undefined;
  }>();
  const emit = defineEmits<{
    next: [];
    split: [columns: number, rows: number];
    change: [patch: Partial<ReviewedCell>];
  }>();
  const statuses: RaidStatus[] = ['unknown', 'fir', 'non_fir'];
  const quantityId = useId();
  const row = computed(() => props.row);
  const search = ref('');
  const columns = ref(1);
  const rows = ref(1);
  watch(
    () => props.row.cell.key,
    () => {
      search.value = '';
      columns.value = rows.value = 1;
    }
  );
  const itemsById = computed(() => new Map(props.items.map((item) => [item.id, item])));
  const selectedName = computed(() => itemsById.value.get(props.row.itemId)?.name ?? '');
  const iconOf = (id: string) => props.imageFor?.(id)?.icon;
  const reference = computed(() => {
    if (!props.row.itemId) return undefined;
    const images = props.imageFor?.(props.row.itemId);
    return images?.grid || images?.icon;
  });
  const matchesSearch = (item: ScanItem, query: string) =>
    [item.name, item.shortName, item.id].some((value) => value.toLocaleLowerCase().includes(query));
  const choices = computed(() => {
    const query = search.value.trim().toLocaleLowerCase();
    if (query) return props.items.filter((item) => matchesSearch(item, query)).slice(0, 30);
    const ids = new Set([
      props.row.itemId,
      ...props.row.cell.candidates.map((candidate) => candidate.itemId),
    ]);
    return [...ids].flatMap((id) => {
      const item = itemsById.value.get(id);
      return item ? [item] : [];
    });
  });
  const maxQuantity = computed(
    () => itemsById.value.get(props.row.itemId)?.maxStack || SCAN_LIMITS.quantity
  );
  /** Unknown items stay editable; a non-stackable identity is always exactly one unit. */
  const stackable = computed(() => !props.row.itemId || maxQuantity.value > 1);
  const validQuantity = computed(
    () =>
      Number.isSafeInteger(props.row.quantity) &&
      Number(props.row.quantity) >= 1 &&
      Number(props.row.quantity) <= maxQuantity.value
  );
  /** Confirming an item that cannot stack also settles it at one unit. */
  const canConfirm = computed(
    () => Boolean(props.row.itemId) && (!stackable.value || validQuantity.value)
  );
  const canSplit = computed(
    () =>
      canSplitRegion(props.row.cell, columns.value, rows.value) && columns.value * rows.value > 1
  );
  function choose(item: ScanItem) {
    const updated = { ...props.row };
    selectItem(updated, item);
    emit('change', updated);
  }
  function setQuantity(event: Event) {
    const input = event.target as HTMLInputElement;
    emit('change', { quantity: input.value === '' ? null : Number(input.value), reviewed: false });
  }
  function setRaidStatus(status: RaidStatus) {
    emit('change', { raidStatus: status });
  }
  function confirm() {
    emit('change', {
      reviewed: true,
      excluded: false,
      ...(stackable.value ? {} : { quantity: 1 }),
    });
    emit('next');
  }
  function exclude() {
    emit('change', { excluded: true });
    emit('next');
  }
</script>
