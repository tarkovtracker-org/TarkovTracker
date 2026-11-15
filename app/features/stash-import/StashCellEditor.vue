<template>
  <div class="bg-surface-800 space-y-3 rounded-lg p-4">
    <h3 class="font-semibold">{{ $t('stash_import.check_item') }} {{ row.cell.key + 1 }}</h3>
    <label class="block text-sm">
      {{ $t('stash_import.search_item') }}
      <input
        v-model="search"
        type="search"
        class="bg-surface-950 mt-1 w-full rounded border border-white/20 p-2"
        :placeholder="$t('stash_import.search_item')"
      />
    </label>
    <div
      class="max-h-48 space-y-1 overflow-y-auto"
      role="group"
      :aria-label="$t('stash_import.matches')"
    >
      <button
        v-for="item in choices"
        :key="item.id"
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm"
        :class="
          row.itemId === item.id
            ? 'border-primary-400 bg-primary-500/10'
            : 'border-white/10 hover:bg-white/5'
        "
        @click="choose(item)"
      >
        <span>{{ item.name }}</span>
        <UIcon v-if="row.itemId === item.id" name="i-mdi-check" />
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <label class="text-sm">
        {{ $t('stash_import.quantity') }}
        <input
          :value="row.quantity"
          type="number"
          min="1"
          :max="maxQuantity"
          step="1"
          inputmode="numeric"
          class="bg-surface-950 mt-1 w-full rounded border border-white/20 p-2"
          @input="setQuantity"
        />
      </label>
      <label class="text-sm">
        {{ $t('stash_import.raid_status') }}
        <select
          :value="row.raidStatus"
          class="bg-surface-950 mt-1 w-full rounded border border-white/20 p-2"
          @change="setRaidStatus"
        >
          <option value="unknown">{{ $t('stash_import.unknown') }}</option>
          <option value="fir">{{ $t('common.fir') }}</option>
          <option value="non_fir">{{ $t('stash_import.non_fir') }}</option>
        </select>
      </label>
    </div>
    <p v-if="row.quantity === null" class="text-warning-300 text-sm">
      {{ $t('stash_import.stack_help') }}
    </p>
    <p class="text-surface-400 text-xs">{{ $t('stash_import.unknown_help') }}</p>
    <div class="flex flex-wrap gap-2">
      <UButton :disabled="!canConfirm" @click="confirm">
        {{ $t('stash_import.confirm_next') }}
      </UButton>
      <UButton variant="soft" @click="exclude">{{ $t('stash_import.exclude') }}</UButton>
    </div>
    <details v-if="row.cell.slotsWide > 1 || row.cell.slotsHigh > 1" class="text-sm">
      <summary class="cursor-pointer">{{ $t('stash_import.split') }}</summary>
      <div class="mt-2 flex items-end gap-2">
        <label>
          {{ $t('stash_import.columns') }}
          <input
            v-model.number="columns"
            type="number"
            min="1"
            :max="row.cell.slotsWide"
            class="bg-surface-950 block w-20 rounded border border-white/20 p-2"
          />
        </label>
        <label>
          {{ $t('stash_import.rows') }}
          <input
            v-model.number="rows"
            type="number"
            min="1"
            :max="row.cell.slotsHigh"
            class="bg-surface-950 block w-20 rounded border border-white/20 p-2"
          />
        </label>
        <UButton variant="soft" :disabled="!canSplit" @click="$emit('split', columns, rows)">
          {{ $t('stash_import.split_apply') }}
        </UButton>
      </div>
    </details>
  </div>
</template>
<script setup lang="ts">
  import { selectItem } from '@/utils/stashScan/review';
  import {
    SCAN_LIMITS,
    type RaidStatus,
    type ReviewedCell,
    type ScanItem,
  } from '@/utils/stashScan/types';
  const props = defineProps<{ row: ReviewedCell; items: ScanItem[] }>();
  const emit = defineEmits<{
    next: [];
    split: [columns: number, rows: number];
    change: [patch: Partial<ReviewedCell>];
  }>();
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
  const canConfirm = computed(
    () =>
      Boolean(props.row.itemId) &&
      Number.isSafeInteger(props.row.quantity) &&
      Number(props.row.quantity) >= 1 &&
      Number(props.row.quantity) <= maxQuantity.value
  );
  const splitsAxis = (count: number, slots: number) =>
    Number.isInteger(count) && count >= 1 && slots % count === 0;
  const canSplit = computed(
    () =>
      splitsAxis(columns.value, props.row.cell.slotsWide) &&
      splitsAxis(rows.value, props.row.cell.slotsHigh) &&
      columns.value * rows.value > 1
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
  function setRaidStatus(event: Event) {
    emit('change', { raidStatus: (event.target as HTMLSelectElement).value as RaidStatus });
  }
  function confirm() {
    emit('change', { reviewed: true, excluded: false });
    emit('next');
  }
  function exclude() {
    emit('change', { excluded: true });
    emit('next');
  }
</script>
