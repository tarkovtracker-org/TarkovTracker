<template>
  <div class="flex min-h-0 flex-col gap-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        :icon="zoomed ? 'i-mdi-magnify-minus-outline' : 'i-mdi-magnify-plus-outline'"
        :disabled="!active"
        @click="zoomed = !zoomed"
      >
        {{ $t(zoomed ? 'stash_import.whole_image' : 'stash_import.zoom_item') }}
      </UButton>
      <UButton
        size="xs"
        :variant="drawing ? 'solid' : 'soft'"
        :color="drawing ? 'primary' : 'neutral'"
        icon="i-mdi-selection-drag"
        :aria-pressed="drawing"
        @click="toggleDrawing"
      >
        {{ $t('stash_import.draw_region') }}
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-mdi-keyboard-outline"
        @click="enterRegion"
      >
        {{ $t('stash_import.enter_region') }}
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-mdi-refresh"
        @click="$emit('rescan')"
      >
        {{ $t('stash_import.rescan') }}
      </UButton>
    </div>
    <p v-if="drawing" class="text-primary-200 bg-primary-500/10 rounded-md px-3 py-2 text-sm">
      {{ $t('stash_import.draw_help') }}
    </p>
    <p v-if="imageError" role="alert" class="text-error-300 text-sm">
      {{ $t('stash_import.errors.image_invalid') }}
    </p>
    <div class="bg-surface-950 min-h-0 overflow-auto rounded-md border border-white/10">
      <svg
        ref="canvas"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMin meet"
        class="block max-h-[40dvh] w-full touch-none lg:max-h-none"
        :class="drawing ? 'cursor-crosshair' : ''"
        :aria-label="$t('stash_import.screenshot')"
        role="group"
        @pointerdown="startRegion"
        @pointermove="moveRegion"
        @pointerup="finishRegion"
        @pointercancel="origin = null"
      >
        <foreignObject :width="width" :height="height">
          <canvas ref="raster" :width="width" :height="height" class="block" />
        </foreignObject>
        <rect
          v-for="row in rows"
          :key="row.cell.key"
          :x="row.cell.x + 1"
          :y="row.cell.y + 1"
          :width="Math.max(1, row.cell.width - 2)"
          :height="Math.max(1, row.cell.height - 2)"
          rx="2"
          class="cursor-pointer outline-none focus-visible:stroke-white"
          :class="regionClass(row)"
          :stroke-width="isActive(row) ? 4 : 2"
          vector-effect="non-scaling-stroke"
          tabindex="0"
          role="button"
          :aria-label="regionLabel(row)"
          :aria-pressed="isActive(row)"
          @click="pick(row)"
          @keydown.enter.prevent="pick(row)"
          @keydown.space.prevent="pick(row)"
        />
        <rect
          v-if="selection"
          v-bind="selection"
          vector-effect="non-scaling-stroke"
          class="fill-primary-500/25 stroke-primary-300 stroke-2"
        />
      </svg>
    </div>
    <ul class="text-surface-400 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li v-for="entry in legend" :key="entry.key" class="flex items-center gap-1.5">
        <span class="size-3 rounded-sm border-2" :class="entry.swatch" aria-hidden="true" />
        {{ $t(`stash_import.legend_${entry.key}`) }}
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { reviewState } from '@/utils/stashScan/review';
  import type { ReviewedCell, ScanRect } from '@/utils/stashScan/types';
  const props = defineProps<{
    bitmap?: ImageBitmap;
    imageError?: boolean;
    width: number;
    height: number;
    rows: ReviewedCell[];
    tracked?: ReadonlySet<string>;
    active?: ReviewedCell;
  }>();
  const emit = defineEmits<{ select: [key: number]; region: [rect: ScanRect]; rescan: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const legend = [
    { key: 'check', swatch: 'border-warning-400 bg-warning-400/25' },
    { key: 'ok', swatch: 'border-success-400' },
    { key: 'skip', swatch: 'border-surface-400 bg-surface-400/15' },
    { key: 'selected', swatch: 'border-primary-300 bg-primary-400/20' },
    { key: 'removed', swatch: 'border-surface-500 border-dashed' },
  ];
  const raster = ref<HTMLCanvasElement>();
  function paint() {
    const context = raster.value?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, props.width, props.height);
    if (props.bitmap) context.drawImage(props.bitmap, 0, 0);
  }
  watch(() => [props.bitmap, props.width, props.height], paint, { flush: 'post' });
  onMounted(paint);
  const canvas = ref<SVGSVGElement>();
  const zoomed = ref(false);
  const drawing = ref(false);
  const origin = ref<{ x: number; y: number } | null>(null);
  const pointer = ref({ x: 0, y: 0 });
  const selection = computed(() =>
    origin.value
      ? {
          x: Math.min(origin.value.x, pointer.value.x),
          y: Math.min(origin.value.y, pointer.value.y),
          width: Math.abs(origin.value.x - pointer.value.x),
          height: Math.abs(origin.value.y - pointer.value.y),
        }
      : null
  );
  /** Zoom keeps neighbouring slots in view so the item can be compared with its surroundings. */
  /**
   * Zoom keeps neighbouring slots in view so the item can be compared with its surroundings.
   * The window is clamped to the screenshot so edge items are never shown beside blank space.
   */
  const span = (size: number, pad: number, limit: number) => Math.min(limit, size + pad * 2);
  const origin1d = (start: number, pad: number, length: number, limit: number) =>
    Math.min(Math.max(0, start - pad), Math.max(0, limit - length));
  const viewBox = computed(() => {
    const cell = props.active?.cell;
    if (!zoomed.value || !cell) return `0 0 ${props.width} ${props.height}`;
    const pad = Math.max(cell.width, cell.height);
    const width = span(cell.width, pad, props.width);
    const height = span(cell.height, pad, props.height);
    const x = origin1d(cell.x, pad, width, props.width);
    const y = origin1d(cell.y, pad, height, props.height);
    return `${x} ${y} ${width} ${height}`;
  });
  /** Each region announces its review state, matching the colour legend. */
  function regionLabel(row: ReviewedCell) {
    return t('stash_import.region_label', {
      number: row.cell.key + 1,
      status: t(`stash_import.legend_${regionStatus(row)}`),
    });
  }
  function regionStatus(row: ReviewedCell) {
    return isActive(row) ? 'selected' : reviewState(row, props.tracked);
  }
  const isActive = (row: ReviewedCell) => row.cell.key === props.active?.cell.key;
  const regionClasses = {
    selected: 'fill-primary-400/20 stroke-primary-300',
    removed: 'fill-transparent stroke-surface-500/40 [stroke-dasharray:4_3]',
    check: 'fill-warning-400/25 stroke-warning-400',
    skip: 'fill-surface-400/10 stroke-surface-400/70',
    ok: 'fill-transparent stroke-success-400/70',
  };
  const regionClass = (row: ReviewedCell) => regionClasses[regionStatus(row)];
  function point(event: PointerEvent) {
    const matrix = canvas.value?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const pixel = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return {
      x: Math.round(Math.max(0, Math.min(props.width, pixel.x))),
      y: Math.round(Math.max(0, Math.min(props.height, pixel.y))),
    };
  }
  function toggleDrawing() {
    drawing.value = !drawing.value;
    if (drawing.value) zoomed.value = false;
  }
  function startRegion(event: PointerEvent) {
    if (!drawing.value) return;
    canvas.value?.setPointerCapture(event.pointerId);
    origin.value = pointer.value = point(event);
  }
  function moveRegion(event: PointerEvent) {
    if (origin.value) pointer.value = point(event);
  }
  function finishRegion(event: PointerEvent) {
    if (!origin.value) return;
    pointer.value = point(event);
    const rect = selection.value!;
    origin.value = null;
    drawing.value = false;
    if (rect.width >= 8 && rect.height >= 8)
      emit('region', { ...rect, slotsWide: 1, slotsHigh: 1 });
  }
  function enterRegion() {
    drawing.value = false;
    origin.value = null;
    emit('region', {
      x: 0,
      y: 0,
      width: props.width,
      height: props.height,
      slotsWide: 1,
      slotsHigh: 1,
    });
  }
  function pick(row: ReviewedCell) {
    if (!drawing.value) emit('select', row.cell.key);
  }
</script>
