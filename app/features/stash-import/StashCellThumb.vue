<template>
  <canvas
    ref="canvas"
    :width="SIZE"
    :height="SIZE"
    class="bg-surface-950 shrink-0 rounded-sm border border-white/10"
    aria-hidden="true"
  />
</template>
<script setup lang="ts">
  import type { ScanRect } from '@/utils/stashScan/types';
  /** Draws one region of the shared decoded screenshot, letterboxed into a square. */
  const props = defineProps<{
    bitmap?: ImageBitmap;
    cell: Pick<ScanRect, 'x' | 'y' | 'width' | 'height'>;
  }>();
  const SIZE = 96;
  const canvas = ref<HTMLCanvasElement>();
  function draw() {
    const context = canvas.value?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, SIZE, SIZE);
    const { x, y, width, height } = props.cell;
    if (!props.bitmap || width <= 0 || height <= 0) return;
    const scale = SIZE / Math.max(width, height);
    const w = width * scale;
    const h = height * scale;
    context.drawImage(props.bitmap, x, y, width, height, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }
  watch(
    () => [props.bitmap, props.cell.x, props.cell.y, props.cell.width, props.cell.height],
    draw,
    {
      flush: 'post',
    }
  );
  onMounted(draw);
</script>
