<template>
  <canvas
    ref="canvas"
    :width="canvasWidth"
    :height="canvasHeight"
    class="bg-surface-950 shrink-0 rounded-sm border border-white/10"
    aria-hidden="true"
  />
</template>
<script setup lang="ts">
  import type { ScanRect } from '@/utils/stashScan/types';
  /**
   * Draws one region of the shared decoded screenshot. Thumbnails are letterboxed into a
   * square; `native` keeps the region's own pixels and shape so CSS can show it large.
   */
  const props = defineProps<{
    bitmap?: ImageBitmap;
    cell: Pick<ScanRect, 'x' | 'y' | 'width' | 'height'>;
    native?: boolean;
  }>();
  const SIZE = 96;
  const canvas = ref<HTMLCanvasElement>();
  const canvasWidth = computed(() =>
    props.native ? Math.max(1, Math.round(props.cell.width)) : SIZE
  );
  const canvasHeight = computed(() =>
    props.native ? Math.max(1, Math.round(props.cell.height)) : SIZE
  );
  function draw() {
    const context = canvas.value?.getContext('2d');
    if (!context) return;
    const frameWidth = canvasWidth.value;
    const frameHeight = canvasHeight.value;
    context.clearRect(0, 0, frameWidth, frameHeight);
    const { x, y, width, height } = props.cell;
    if (!props.bitmap || width <= 0 || height <= 0) return;
    const scale = Math.min(frameWidth / width, frameHeight / height);
    const w = width * scale;
    const h = height * scale;
    context.drawImage(
      props.bitmap,
      x,
      y,
      width,
      height,
      (frameWidth - w) / 2,
      (frameHeight - h) / 2,
      w,
      h
    );
  }
  watch(
    () => [
      props.bitmap,
      props.cell.x,
      props.cell.y,
      props.cell.width,
      props.cell.height,
      props.native,
    ],
    draw,
    {
      flush: 'post',
    }
  );
  onMounted(draw);
</script>
