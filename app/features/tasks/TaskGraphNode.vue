<script setup lang="ts">
  import { Handle, Position } from '@vue-flow/core';
  import type { TaskNodeData } from '@/composables/useTaskGraphData';
  const props = defineProps<{
    data: TaskNodeData;
  }>();
  const emit = defineEmits<{
    focus: [taskId: string];
    navigate: [taskId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const isKeyboardFocused = ref(false);
  const statusClasses = computed(() => {
    if (props.data.isDimmed) {
      return 'border-surface-700 bg-surface-900/50 opacity-30';
    }
    switch (props.data.status) {
      case 'completed':
        return 'border-success-500/60 bg-success-500/10';
      case 'available':
        return 'border-info-500/60 bg-info-500/10';
      case 'failed':
        return 'border-error-500/60 bg-error-500/10';
      default:
        return 'border-surface-600 bg-surface-800';
    }
  });
  const focusRingClass = computed(() => {
    if (props.data.isFocused || isKeyboardFocused.value) return 'ring-2 ring-primary-500';
    return '';
  });
  const crossTraderClass = computed(() => {
    return props.data.isCrossTrader ? 'border-dashed scale-90' : '';
  });
  const positionIndicator = computed(() => {
    if (props.data.isRoot && props.data.isLeaf) return 'standalone';
    if (props.data.isRoot) return 'root';
    if (props.data.isLeaf) return 'leaf';
    return null;
  });
  const onClick = () => {
    emit('focus', props.data.taskId);
  };
  const onDblClick = () => {
    emit('navigate', props.data.taskId);
  };
  const onFocus = () => {
    isKeyboardFocused.value = true;
  };
  const onBlur = () => {
    isKeyboardFocused.value = false;
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.stopPropagation();
      onClick();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }
  };
</script>
<template>
  <div
    role="button"
    tabindex="0"
    class="relative max-w-48 min-w-36 cursor-pointer rounded-lg border px-3 py-2 shadow-sm transition-all select-none"
    :class="[
      statusClasses,
      focusRingClass,
      crossTraderClass,
      positionIndicator === 'root' || positionIndicator === 'standalone'
        ? 'border-t-primary-400 border-t-2'
        : '',
      positionIndicator === 'leaf' || positionIndicator === 'standalone'
        ? 'border-b-warning-400 border-b-2'
        : '',
    ]"
    @click.stop="onClick"
    @dblclick.stop="onDblClick"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <Handle type="target" :position="Position.Top" class="!bg-surface-500 !h-2 !w-2" />
    <div
      v-if="positionIndicator === 'root' || positionIndicator === 'standalone'"
      class="absolute -top-6 left-1/2 -translate-x-1/2"
    >
      <span
        :title="t('page.tasks.graph.flow_start')"
        class="text-primary-400/70 text-[9px] leading-none font-semibold tracking-wide whitespace-nowrap uppercase"
      >
        {{ t('page.tasks.graph.flow_start') }}
      </span>
    </div>
    <div
      v-if="positionIndicator === 'leaf' || positionIndicator === 'standalone'"
      class="absolute -bottom-6 left-1/2 -translate-x-1/2"
    >
      <span
        :title="t('page.tasks.graph.flow_end')"
        class="text-warning-400/70 text-[9px] leading-none font-semibold tracking-wide whitespace-nowrap uppercase"
      >
        {{ t('page.tasks.graph.flow_end') }}
      </span>
    </div>
    <div class="flex flex-col gap-0.5">
      <span class="text-surface-100 truncate text-xs leading-tight font-medium">
        {{ data.taskName }}
      </span>
      <div class="text-surface-400 flex items-center gap-1.5 text-[10px]">
        <span v-if="data.minPlayerLevel > 0">
          {{ t('page.tasks.graph.node_level', { level: data.minPlayerLevel }) }}
        </span>
        <span
          v-if="data.kappaRequired"
          :title="t('page.tasks.questcard.kappa_tooltip')"
          class="bg-kappa-500/20 rounded p-0.5"
        >
          <UIcon name="i-mdi-trophy" class="text-kappa h-3 w-3" aria-hidden="true" />
        </span>
        <span
          v-if="data.lightkeeperRequired"
          :title="t('page.tasks.questcard.lightkeeper_tooltip')"
          class="bg-lightkeeper-500/20 rounded p-0.5"
        >
          <UIcon name="i-mdi-lighthouse" class="text-lightkeeper h-3 w-3" aria-hidden="true" />
        </span>
      </div>
      <span v-if="data.isCrossTrader" class="text-surface-500 truncate text-[10px] italic">
        {{ data.traderName }}
      </span>
    </div>
    <Handle type="source" :position="Position.Bottom" class="!bg-surface-500 !h-2 !w-2" />
  </div>
</template>
