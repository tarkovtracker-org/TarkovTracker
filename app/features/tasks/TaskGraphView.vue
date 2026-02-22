<script setup lang="ts">
  import { Controls } from '@vue-flow/controls';
  import { VueFlow, useVueFlow } from '@vue-flow/core';
  import { MiniMap } from '@vue-flow/minimap';
  import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import { useMapResize } from '@/composables/useMapResize';
  import { useTaskGraphData } from '@/composables/useTaskGraphData';
  import TaskGraphNode from '@/features/tasks/TaskGraphNode.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { layoutTaskGraph } from '@/utils/taskGraphLayout';
  import type { TaskNodeData } from '@/composables/useTaskGraphData';
  import type { Node } from '@vue-flow/core';
  import '@vue-flow/core/dist/style.css';
  import '@vue-flow/controls/dist/style.css';
  import '@vue-flow/minimap/dist/style.css';
  const props = defineProps<{
    allowedTaskIds?: Set<string> | null;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const { getTaskTraderView } = storeToRefs(preferencesStore);
  const breakpoints = useBreakpoints(breakpointsTailwind);
  const isLgAndUp = breakpoints.greaterOrEqual('lg');
  const focusedTaskId = ref<string | null>(null);
  const isFocusChainIsolated = ref(false);
  const traderId = computed(() => getTaskTraderView.value || '');
  const allowedTaskIds = computed(() => props.allowedTaskIds ?? null);
  const { nodes: rawNodes, edges: rawEdges } = useTaskGraphData(
    traderId,
    focusedTaskId,
    allowedTaskIds
  );
  const visibleNodes = computed<Node<TaskNodeData>[]>(() => {
    if (!focusedTaskId.value || !isFocusChainIsolated.value) return rawNodes.value;
    return rawNodes.value.filter((node) => node.data?.isInFocusChain);
  });
  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)));
  const visibleEdges = computed(() =>
    rawEdges.value.filter(
      (edge) => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)
    )
  );
  const layoutNodes = computed<Node<TaskNodeData>[]>(() => {
    if (!visibleNodes.value.length) return [];
    return layoutTaskGraph(visibleNodes.value, visibleEdges.value, 'TB');
  });
  const {
    findNode,
    fitBounds,
    fitView,
    getViewport,
    setCenter,
    setViewport,
    viewport: flowViewport,
  } = useVueFlow('task-graph');
  const isGraphMounted = ref(false);
  const graphSurfaceRef = ref<HTMLElement | null>(null);
  const pressedGraphKeys = new Set<'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out'>();
  let graphKeyboardFrameId: number | null = null;
  let graphKeyboardLastTick = 0;
  const GRAPH_MIN_ZOOM = 0.05;
  const GRAPH_MAX_ZOOM = 4;
  const GRAPH_PAN_SPEED = 1000;
  const GRAPH_ZOOM_SPEED = 1.7;
  const GRAPH_NODE_WIDTH = 180;
  const GRAPH_NODE_HEIGHT = 70;
  const GRAPH_EDGE_VISIBILITY_PADDING = 24;
  const isApplyingViewportClamp = ref(false);
  const hasNodes = computed(() => visibleNodes.value.length > 0);
  const {
    isResizing,
    mapHeight: graphHeight,
    mapHeightMax: graphHeightMax,
    mapHeightMin: graphHeightMin,
    onResizeKeydown,
    resizeHandleRef,
    startResize,
  } = useMapResize({
    defaultHeight: 620,
    maxHeightRatio: 0.8,
    minHeight: 360,
    storageKey: 'tasks_graph_height',
  });
  const graphContainerStyle = computed(() => ({
    height: `${graphHeight.value}px`,
  }));
  const focusedTaskName = computed(() => {
    if (!focusedTaskId.value) return '';
    const node = rawNodes.value.find((n) => n.id === focusedTaskId.value);
    return node?.data?.taskName ?? '';
  });
  const graphSignature = computed(() => {
    const nodeIds = layoutNodes.value.map((node) => node.id).sort((a, b) => a.localeCompare(b));
    const edgeIds = visibleEdges.value.map((edge) => edge.id).sort((a, b) => a.localeCompare(b));
    return `${nodeIds.join('|')}::${edgeIds.join('|')}`;
  });
  const graphLayoutBounds = computed(() => {
    if (!layoutNodes.value.length) return null;
    const xs = layoutNodes.value.map((node) => node.position.x);
    const ys = layoutNodes.value.map((node) => node.position.y);
    return {
      maxX: Math.max(...xs) + GRAPH_NODE_WIDTH,
      maxY: Math.max(...ys) + GRAPH_NODE_HEIGHT,
      minX: Math.min(...xs),
      minY: Math.min(...ys),
    };
  });
  const focusChainNodeIds = computed(() =>
    layoutNodes.value.filter((node) => node.data?.isInFocusChain).map((node) => node.id)
  );
  const onNodeFocus = (taskId: string) => {
    if (focusedTaskId.value === taskId) return;
    if (!focusedTaskId.value) {
      isFocusChainIsolated.value = false;
    }
    focusedTaskId.value = taskId;
  };
  const onNodeNavigate = (taskId: string) => {
    preferencesStore.setTaskPrimaryView('all');
    router.push({ path: '/tasks', query: { task: taskId } });
  };
  const clearFocus = () => {
    focusedTaskId.value = null;
    isFocusChainIsolated.value = false;
  };
  const toggleFocusIsolation = () => {
    isFocusChainIsolated.value = !isFocusChainIsolated.value;
  };
  const normalizeGraphControlKey = (
    key: string
  ): 'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out' | null => {
    switch (key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        return 'up';
      case 's':
      case 'arrowdown':
        return 'down';
      case 'a':
      case 'arrowleft':
        return 'left';
      case 'd':
      case 'arrowright':
        return 'right';
      case 'e':
        return 'zoom-in';
      case 'q':
        return 'zoom-out';
      default:
        return null;
    }
  };
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
      )
    );
  };
  const isGraphKeyboardActive = () => {
    if (!hasNodes.value || !isLgAndUp.value) return false;
    const graphSurface = graphSurfaceRef.value;
    if (!graphSurface) return false;
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement && graphSurface.contains(activeElement);
  };
  const stopGraphKeyboardLoop = (clearKeys = false) => {
    if (graphKeyboardFrameId !== null) {
      window.cancelAnimationFrame(graphKeyboardFrameId);
      graphKeyboardFrameId = null;
    }
    graphKeyboardLastTick = 0;
    if (clearKeys) {
      pressedGraphKeys.clear();
    }
  };
  const clampValue = (value: number, minValue: number, maxValue: number) =>
    Math.max(minValue, Math.min(maxValue, value));
  const clampViewportToVisibleGraph = (transform: { x: number; y: number; zoom: number }) => {
    const graphBounds = graphLayoutBounds.value;
    const graphSurface = graphSurfaceRef.value;
    if (!graphBounds || !graphSurface) return transform;
    const { height, width } = graphSurface.getBoundingClientRect();
    if (width <= 0 || height <= 0) return transform;
    const clampedZoom = clampValue(transform.zoom, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM);
    const minX = GRAPH_EDGE_VISIBILITY_PADDING - graphBounds.maxX * clampedZoom;
    const maxX = width - GRAPH_EDGE_VISIBILITY_PADDING - graphBounds.minX * clampedZoom;
    const minY = GRAPH_EDGE_VISIBILITY_PADDING - graphBounds.maxY * clampedZoom;
    const maxY = height - GRAPH_EDGE_VISIBILITY_PADDING - graphBounds.minY * clampedZoom;
    const clampedX = minX > maxX ? (minX + maxX) / 2 : clampValue(transform.x, minX, maxX);
    const clampedY = minY > maxY ? (minY + maxY) / 2 : clampValue(transform.y, minY, maxY);
    return {
      x: clampedX,
      y: clampedY,
      zoom: clampedZoom,
    };
  };
  const applyGraphKeyboardStep = (elapsedMs: number) => {
    if (!pressedGraphKeys.size) return;
    const graphSurface = graphSurfaceRef.value;
    if (!graphSurface) return;
    const viewport = getViewport();
    let nextX = viewport.x;
    let nextY = viewport.y;
    let nextZoom = viewport.zoom;
    const panDelta = GRAPH_PAN_SPEED * (elapsedMs / 1000);
    const zoomDelta = GRAPH_ZOOM_SPEED * (elapsedMs / 1000);
    const moveUp = pressedGraphKeys.has('up');
    const moveDown = pressedGraphKeys.has('down');
    const moveLeft = pressedGraphKeys.has('left');
    const moveRight = pressedGraphKeys.has('right');
    const zoomIn = pressedGraphKeys.has('zoom-in');
    const zoomOut = pressedGraphKeys.has('zoom-out');
    if (moveUp && !moveDown) nextY += panDelta;
    if (moveDown && !moveUp) nextY -= panDelta;
    if (moveLeft && !moveRight) nextX += panDelta;
    if (moveRight && !moveLeft) nextX -= panDelta;
    if (zoomIn && !zoomOut) {
      nextZoom = Math.min(GRAPH_MAX_ZOOM, viewport.zoom * (1 + zoomDelta));
    } else if (zoomOut && !zoomIn) {
      nextZoom = Math.max(GRAPH_MIN_ZOOM, viewport.zoom / (1 + zoomDelta));
    }
    if (nextZoom !== viewport.zoom) {
      const { height, width } = graphSurface.getBoundingClientRect();
      const centerScreenX = width / 2;
      const centerScreenY = height / 2;
      const centerFlowX = (centerScreenX - nextX) / viewport.zoom;
      const centerFlowY = (centerScreenY - nextY) / viewport.zoom;
      nextX = centerScreenX - centerFlowX * nextZoom;
      nextY = centerScreenY - centerFlowY * nextZoom;
    }
    const clampedViewport = clampViewportToVisibleGraph({ x: nextX, y: nextY, zoom: nextZoom });
    nextX = clampedViewport.x;
    nextY = clampedViewport.y;
    nextZoom = clampedViewport.zoom;
    if (nextX === viewport.x && nextY === viewport.y && nextZoom === viewport.zoom) return;
    void setViewport({ x: nextX, y: nextY, zoom: nextZoom });
  };
  const runGraphKeyboardLoop = (timestamp: number) => {
    if (!isGraphKeyboardActive() || !pressedGraphKeys.size) {
      stopGraphKeyboardLoop(true);
      return;
    }
    const elapsedMs = graphKeyboardLastTick ? Math.min(48, timestamp - graphKeyboardLastTick) : 16;
    graphKeyboardLastTick = timestamp;
    applyGraphKeyboardStep(elapsedMs);
    graphKeyboardFrameId = window.requestAnimationFrame(runGraphKeyboardLoop);
  };
  const startGraphKeyboardLoop = () => {
    if (graphKeyboardFrameId !== null) return;
    graphKeyboardLastTick = 0;
    graphKeyboardFrameId = window.requestAnimationFrame(runGraphKeyboardLoop);
  };
  const focusGraphSurface = () => {
    graphSurfaceRef.value?.focus({ preventScroll: true });
  };
  const resetGraphViewport = async () => {
    stopGraphKeyboardLoop(true);
    if (!isGraphMounted.value || !hasNodes.value) return;
    await nextTick();
    if (!isGraphMounted.value) return;
    await fitView({ duration: 320, interpolate: 'smooth', padding: 0.2 });
  };
  const onGlobalGraphKeydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'r') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!isGraphKeyboardActive()) return;
      event.preventDefault();
      if (event.repeat) return;
      void resetGraphViewport();
      return;
    }
    const controlKey = normalizeGraphControlKey(event.key);
    if (!controlKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    if (!isGraphKeyboardActive()) return;
    event.preventDefault();
    pressedGraphKeys.add(controlKey);
    startGraphKeyboardLoop();
  };
  const onGlobalGraphKeyup = (event: KeyboardEvent) => {
    const controlKey = normalizeGraphControlKey(event.key);
    if (!controlKey) return;
    pressedGraphKeys.delete(controlKey);
    if (!pressedGraphKeys.size) {
      stopGraphKeyboardLoop();
    }
  };
  const onGraphWindowBlur = () => {
    stopGraphKeyboardLoop(true);
  };
  watch(traderId, () => {
    focusedTaskId.value = null;
    isFocusChainIsolated.value = false;
  });
  watch([focusedTaskId, rawNodes], ([taskId, nodes]) => {
    if (!taskId) return;
    if (nodes.some((node) => node.id === taskId)) return;
    focusedTaskId.value = null;
    isFocusChainIsolated.value = false;
  });
  watch(
    () => [flowViewport.value.x, flowViewport.value.y, flowViewport.value.zoom],
    () => {
      if (!isGraphMounted.value || !hasNodes.value || isApplyingViewportClamp.value) return;
      const currentViewport = getViewport();
      const clampedViewport = clampViewportToVisibleGraph(currentViewport);
      if (
        clampedViewport.x === currentViewport.x &&
        clampedViewport.y === currentViewport.y &&
        clampedViewport.zoom === currentViewport.zoom
      ) {
        return;
      }
      isApplyingViewportClamp.value = true;
      void setViewport(clampedViewport).finally(() => {
        isApplyingViewportClamp.value = false;
      });
    }
  );
  watch(
    [graphHeight, graphSignature],
    () => {
      if (!isGraphMounted.value || !hasNodes.value || isApplyingViewportClamp.value) return;
      const currentViewport = getViewport();
      const clampedViewport = clampViewportToVisibleGraph(currentViewport);
      if (
        clampedViewport.x === currentViewport.x &&
        clampedViewport.y === currentViewport.y &&
        clampedViewport.zoom === currentViewport.zoom
      ) {
        return;
      }
      isApplyingViewportClamp.value = true;
      void setViewport(clampedViewport).finally(() => {
        isApplyingViewportClamp.value = false;
      });
    },
    { flush: 'post' }
  );
  onMounted(() => {
    isGraphMounted.value = true;
    window.addEventListener('keydown', onGlobalGraphKeydown);
    window.addEventListener('keyup', onGlobalGraphKeyup);
    window.addEventListener('blur', onGraphWindowBlur);
  });
  onBeforeUnmount(() => {
    isGraphMounted.value = false;
    window.removeEventListener('keydown', onGlobalGraphKeydown);
    window.removeEventListener('keyup', onGlobalGraphKeyup);
    window.removeEventListener('blur', onGraphWindowBlur);
    stopGraphKeyboardLoop(true);
  });
  watch(
    [traderId, graphSignature],
    async () => {
      if (!isGraphMounted.value) return;
      await nextTick();
      if (!isGraphMounted.value || focusedTaskId.value || !hasNodes.value) return;
      await fitView({ duration: 300, interpolate: 'smooth', padding: 0.2 });
    },
    { immediate: true }
  );
  watch(
    [focusedTaskId, isFocusChainIsolated],
    async ([nextFocusedId]) => {
      if (!isGraphMounted.value || !hasNodes.value) return;
      await nextTick();
      if (!isGraphMounted.value) return;
      if (!nextFocusedId) {
        await fitView({ duration: 300, interpolate: 'smooth', padding: 0.2 });
        return;
      }
      if (!focusChainNodeIds.value.length) return;
      const focusPadding = { bottom: '28px', left: '20px', right: '20px', top: '28px' } as const;
      const focusRatio = focusChainNodeIds.value.length / Math.max(rawNodes.value.length, 1);
      const chainNodes = focusChainNodeIds.value
        .map((nodeId) => findNode(nodeId))
        .filter(
          (node): node is NonNullable<typeof node> =>
            !!node && node.dimensions.width > 0 && node.dimensions.height > 0
        );
      const focusedNode =
        chainNodes.find((node) => node.id === nextFocusedId) ?? findNode(nextFocusedId);
      if (focusRatio >= 0.7 && focusedNode && focusedNode.dimensions.width > 0) {
        const focusedCenterX = focusedNode.position.x + focusedNode.dimensions.width / 2;
        const focusedCenterY = focusedNode.position.y + focusedNode.dimensions.height / 2;
        const targetZoom = Math.max(getViewport().zoom, 0.85);
        await setCenter(focusedCenterX, focusedCenterY, {
          duration: 320,
          interpolate: 'smooth',
          zoom: targetZoom,
        });
        return;
      }
      if (!chainNodes.length) {
        await fitView({
          duration: 380,
          interpolate: 'smooth',
          nodes: focusChainNodeIds.value,
          padding: focusPadding,
        });
        return;
      }
      const minX = Math.min(...chainNodes.map((node) => node.position.x));
      const minY = Math.min(...chainNodes.map((node) => node.position.y));
      const maxX = Math.max(...chainNodes.map((node) => node.position.x + node.dimensions.width));
      const maxY = Math.max(...chainNodes.map((node) => node.position.y + node.dimensions.height));
      await fitBounds(
        { height: maxY - minY, width: maxX - minX, x: minX, y: minY },
        {
          duration: 380,
          interpolate: 'smooth',
          padding: focusPadding,
        }
      );
    },
    { flush: 'post' }
  );
  const legendItems = computed(() => [
    { label: t('page.tasks.graph.completed'), colorClass: 'bg-success-500' },
    { label: t('page.tasks.graph.available'), colorClass: 'bg-info-500' },
    { label: t('page.tasks.graph.locked'), colorClass: 'bg-surface-500' },
    { label: t('page.tasks.graph.failed'), colorClass: 'bg-error-500' },
    { label: t('page.tasks.graph.flow_start'), colorClass: 'bg-primary-400' },
    { label: t('page.tasks.graph.flow_end'), colorClass: 'bg-warning-400' },
  ]);
  const minimapNodeColor = (node: Node<TaskNodeData>) => {
    if (node.data?.isDimmed) return 'hsl(0 0% 32%)';
    switch (node.data?.status) {
      case 'completed':
        return 'var(--color-success-500)';
      case 'available':
        return 'var(--color-info-500)';
      case 'failed':
        return 'var(--color-error-500)';
      default:
        return 'hsl(0 0% 58%)';
    }
  };
  const minimapNodeStrokeColor = (node: Node<TaskNodeData>) => {
    if (node.id === focusedTaskId.value) return 'var(--color-primary-300)';
    return 'hsl(0 0% 6%)';
  };
</script>
<template>
  <div v-if="!isLgAndUp" class="py-8 text-center">
    <UIcon name="i-mdi-monitor" class="text-surface-400 mx-auto mb-3 h-10 w-10" />
    <p class="text-surface-400 text-sm">{{ t('page.tasks.graph.mobile_unavailable') }}</p>
  </div>
  <div v-else-if="!hasNodes" class="py-8 text-center">
    <UIcon name="i-mdi-graph-outline" class="text-surface-400 mx-auto mb-3 h-10 w-10" />
    <p class="text-surface-400 text-sm">{{ t('page.tasks.graph.no_tasks') }}</p>
  </div>
  <div v-else class="relative">
    <div
      class="bg-warning-500/10 border-warning-500/30 mb-3 flex items-center gap-2 rounded-lg border px-4 py-2"
    >
      <UIcon name="i-mdi-flask-outline" class="text-warning-400 h-4 w-4 shrink-0" />
      <span class="text-surface-300 text-xs">
        {{ t('page.tasks.graph.alpha_notice') }}
      </span>
    </div>
    <div
      v-if="focusedTaskId"
      class="bg-primary-500/10 border-primary-500/30 mb-3 flex items-center gap-2 rounded-lg border px-4 py-2"
    >
      <UIcon name="i-mdi-target" class="text-primary-400 h-4 w-4 shrink-0" />
      <span class="text-surface-200 text-sm">
        {{ t('page.tasks.graph.focus_mode_active', { taskName: focusedTaskName }) }}
      </span>
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        class="ml-auto"
        @click="toggleFocusIsolation"
      >
        {{
          isFocusChainIsolated
            ? t('page.tasks.graph.show_context')
            : t('page.tasks.graph.isolate_chain')
        }}
      </UButton>
      <UButton size="xs" variant="soft" color="primary" @click="clearFocus">
        {{ t('page.tasks.graph.clear_focus') }}
      </UButton>
    </div>
    <div
      ref="graphSurfaceRef"
      tabindex="0"
      class="bg-surface-900 focus-visible:ring-primary-500 relative rounded-lg border border-white/12 focus:outline-none focus-visible:ring-2"
      :style="graphContainerStyle"
      @pointerdown="focusGraphSurface"
    >
      <VueFlow
        id="task-graph"
        :nodes="layoutNodes"
        :edges="visibleEdges"
        :fit-view-on-init="true"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :min-zoom="0.05"
        :max-zoom="4"
        :default-edge-options="{
          type: 'smoothstep',
          animated: false,
        }"
        class="h-full w-full"
      >
        <template #node-taskNode="{ data }">
          <TaskGraphNode :data="data" @focus="onNodeFocus" @navigate="onNodeNavigate" />
        </template>
        <Controls position="bottom-right" :show-interactive="false" />
        <MiniMap
          position="top-left"
          class="task-graph-minimap"
          :node-color="minimapNodeColor"
          :node-stroke-color="minimapNodeStrokeColor"
          :node-stroke-width="1"
          :mask-color="'hsl(0 0% 1% / 0.74)'"
          :mask-stroke-color="'var(--color-primary-400)'"
          :mask-stroke-width="2.5"
          :mask-border-radius="6"
          :height="140"
          :width="220"
        />
      </VueFlow>
      <div
        class="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-white/8 bg-black/40 px-2.5 py-1.5 backdrop-blur-sm"
      >
        <UIcon name="i-mdi-arrow-down" class="text-surface-400 h-3.5 w-3.5" />
        <span class="text-surface-400 text-[10px] font-medium tracking-wide">
          {{ t('page.tasks.graph.flow_direction') }}
        </span>
      </div>
      <div
        class="bg-surface-900/90 absolute top-12 right-3 z-10 w-52 rounded-lg border border-white/10 px-3 py-2"
      >
        <span
          class="text-surface-400 mb-2 block text-[10px] font-semibold tracking-wider uppercase"
        >
          {{ t('page.tasks.graph.keyboard_controls_title') }}
        </span>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="text-surface-200 flex items-center gap-1 text-[10px] font-medium">
              <kbd class="bg-surface-800 rounded border border-white/10 px-1.5 py-0.5">WASD</kbd>
              <span>/</span>
              <kbd class="bg-surface-800 rounded border border-white/10 px-1.5 py-0.5">↑↓←→</kbd>
            </div>
            <span class="text-surface-400 text-[10px]">
              {{ t('page.tasks.graph.keyboard_pan') }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div class="text-surface-200 flex items-center gap-1 text-[10px] font-medium">
              <kbd class="bg-surface-800 rounded border border-white/10 px-1.5 py-0.5">Q/E</kbd>
            </div>
            <span class="text-surface-400 text-[10px]">
              {{ t('page.tasks.graph.keyboard_zoom') }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div class="text-surface-200 flex items-center gap-1 text-[10px] font-medium">
              <kbd class="bg-surface-800 rounded border border-white/10 px-1.5 py-0.5">R</kbd>
            </div>
            <span class="text-surface-400 text-[10px]">
              {{ t('page.tasks.graph.keyboard_reset') }}
            </span>
          </div>
        </div>
      </div>
      <div
        class="bg-surface-900/90 absolute bottom-4 left-4 z-10 rounded-lg border border-white/10 px-3 py-2"
      >
        <span
          class="text-surface-400 mb-1.5 block text-[10px] font-semibold tracking-wider uppercase"
        >
          {{ t('page.tasks.graph.legend') }}
        </span>
        <div class="flex flex-col gap-1">
          <div v-for="item in legendItems" :key="item.label" class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" :class="item.colorClass" />
            <span class="text-surface-300 text-[11px]">{{ item.label }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      ref="resizeHandleRef"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="t('page.tasks.graph.resize_handle')"
      :aria-valuemin="graphHeightMin"
      :aria-valuemax="graphHeightMax"
      :aria-valuenow="graphHeight"
      tabindex="0"
      class="bg-surface-900/60 border-surface-700 text-surface-400 hover:text-surface-200 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 mt-3 flex h-8 w-full cursor-row-resize touch-none items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :class="{ 'ring-primary-500 text-surface-200 ring-1': isResizing }"
      @pointerdown="startResize"
      @keydown="onResizeKeydown"
    >
      <UIcon name="i-mdi-drag-horizontal-variant" class="h-4 w-4" />
    </div>
  </div>
</template>
