<template>
  <div class="grid grid-cols-2 gap-2" role="group" :aria-label="$t('stash_import.compare_label')">
    <figure class="flex min-w-0 flex-col gap-1.5">
      <div class="relative">
        <StashCellThumb
          native
          class="h-40 w-full object-contain p-1.5"
          data-testid="stash-compare-screenshot"
          :bitmap="bitmap"
          :cell="row.cell"
        />
        <span
          v-if="row.cell.fir"
          class="bg-success-600/90 absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white"
        >
          <UIcon name="i-mdi-check-decagram" class="size-3.5" aria-hidden="true" />
          {{ $t('stash_import.compare_fir_seen') }}
        </span>
      </div>
      <figcaption class="text-surface-400 truncate text-xs">
        {{ $t('stash_import.compare_screenshot') }}
      </figcaption>
    </figure>
    <figure class="flex min-w-0 flex-col gap-1.5">
      <div
        class="bg-surface-950 flex h-40 w-full items-center justify-center rounded-sm border border-white/10 p-1.5"
      >
        <img
          v-if="reference && !broken"
          :src="reference"
          alt=""
          class="size-full object-contain"
          data-testid="stash-compare-reference"
          @error="broken = true"
        />
        <UIcon
          v-else
          :name="row.itemId ? 'i-mdi-image-off-outline' : 'i-mdi-help-box-outline'"
          class="text-surface-600 size-10"
          aria-hidden="true"
        />
      </div>
      <figcaption class="min-w-0 text-xs">
        <span class="text-surface-400 block truncate">
          {{ $t('stash_import.compare_selected') }}
        </span>
        <span
          class="block truncate"
          :class="row.itemId ? 'text-surface-100' : 'text-warning-300 italic'"
        >
          {{ row.itemId ? itemName : $t('stash_import.compare_none') }}
        </span>
      </figcaption>
    </figure>
  </div>
</template>
<script setup lang="ts">
  import StashCellThumb from '@/features/stash-import/StashCellThumb.vue';
  import type { ReviewedCell } from '@/utils/stashScan/types';
  /**
   * The detected region next to the chosen item's in-game picture, both large enough to
   * spot a wrong match or the found-in-raid checkmark without hunting in the screenshot.
   */
  const props = defineProps<{
    row: ReviewedCell;
    bitmap?: ImageBitmap;
    itemName: string;
    reference?: string;
  }>();
  const broken = ref(false);
  watch(
    () => props.reference,
    () => {
      broken.value = false;
    }
  );
</script>
