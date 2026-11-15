<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <UButton size="sm" variant="soft" :disabled="!active" @click="zoomed = !zoomed">
        {{ $t(zoomed ? 'stash_import.whole_image' : 'stash_import.zoom_item') }}
      </UButton>
      <UButton size="sm" :variant="drawing ? 'solid' : 'soft'" @click="drawing = !drawing">
        {{ $t('stash_import.draw_region') }}
      </UButton>
    </div>
    <p v-if="drawing" class="text-warning-300 text-sm">{{ $t('stash_import.draw_help') }}</p>
    <p v-if="paintError" role="alert" class="text-error-300 text-sm">
      {{ $t('stash_import.errors.image_invalid') }}
    </p>
    <svg
      ref="canvas"
      :viewBox="viewBox"
      class="bg-surface-950 max-h-160 w-full touch-none rounded border border-white/10"
      :aria-label="$t('stash_import.screenshot')"
      role="img"
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
        :x="row.cell.x"
        :y="row.cell.y"
        :width="row.cell.width"
        :height="row.cell.height"
        class="cursor-pointer fill-transparent stroke-2 focus:stroke-white focus:outline-none"
        :class="regionClass(row)"
        tabindex="0"
        role="button"
        :aria-label="$t('stash_import.region_label', { number: row.cell.key + 1 })"
        @click="pick(row)"
        @keydown.enter.prevent="pick(row)"
        @keydown.space.prevent="pick(row)"
      />
      <rect
        v-if="selection"
        v-bind="selection"
        class="fill-primary-500/20 stroke-primary-400 stroke-2"
      />
    </svg>
  </div>
</template>
<script setup lang="ts">
  import { needsReview } from '@/utils/stashScan/review';
  import type { ReviewedCell, ScanRect } from '@/utils/stashScan/types';
  const props = defineProps<{
    image: Blob;
    width: number;
    height: number;
    rows: ReviewedCell[];
    active?: ReviewedCell;
  }>();
  const emit = defineEmits<{ select: [key: number]; region: [rect: ScanRect] }>();
  const raster = ref<HTMLCanvasElement>();
  const paintError = ref(false);
  let paintRevision = 0;
  function drawBitmap(bitmap: ImageBitmap, revision: number) {
    try {
      if (revision !== paintRevision) return;
      const context = raster.value?.getContext('2d');
      context?.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
  }
  async function paint() {
    const revision = ++paintRevision;
    paintError.value = false;
    try {
      drawBitmap(await createImageBitmap(props.image), revision);
    } catch {
      if (revision === paintRevision) paintError.value = true;
    }
  }
  watch(
    () => props.image,
    () => {
      void paint();
    },
    { flush: 'post' }
  );
  onMounted(() => {
    void paint();
  });
  onBeforeUnmount(() => {
    paintRevision++;
  });
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
  const viewBox = computed(() => {
    const cell = props.active?.cell;
    if (!zoomed.value || !cell) return `0 0 ${props.width} ${props.height}`;
    return `${cell.x} ${cell.y} ${cell.width} ${cell.height}`;
  });
  const isActive = (row: ReviewedCell) => row.cell.key === props.active?.cell.key;
  function regionClass(row: ReviewedCell) {
    if (isActive(row)) return 'stroke-primary-400';
    if (row.excluded) return 'stroke-surface-500/30';
    return needsReview(row) ? 'stroke-warning-400' : 'stroke-success-400/60';
  }
  function point(event: PointerEvent) {
    const matrix = canvas.value?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const pixel = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return {
      x: Math.round(Math.max(0, Math.min(props.width, pixel.x))),
      y: Math.round(Math.max(0, Math.min(props.height, pixel.y))),
    };
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
  function pick(row: ReviewedCell) {
    if (!drawing.value) emit('select', row.cell.key);
  }
</script>
