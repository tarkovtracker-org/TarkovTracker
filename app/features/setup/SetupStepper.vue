<template>
  <nav
    class="bg-surface-900/90 rounded-xl border border-white/10 px-4 py-3 shadow-sm"
    :aria-label="$t('setup.progress_label')"
  >
    <div class="space-y-2 sm:hidden">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-surface-400 font-medium">
          {{ $t('setup.step_counter', { current: currentIndex + 1, total: steps.length }) }}
        </span>
        <span class="text-surface-100 truncate font-semibold">
          {{ stepLabel(currentStep) }}
        </span>
      </div>
      <div class="bg-surface-800 h-1.5 w-full overflow-hidden rounded-full">
        <div
          class="bg-primary-500 h-full rounded-full transition-all duration-200"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>
    <ol class="hidden items-center gap-1.5 sm:flex">
      <li
        v-for="(item, index) in steps"
        :key="item"
        class="flex items-center gap-1.5"
        :class="index < steps.length - 1 ? 'min-w-0 flex-1' : 'shrink-0'"
      >
        <button
          type="button"
          class="focus-visible:ring-primary-500/60 flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="stepButtonClass(index)"
          :disabled="disabled || index >= currentIndex"
          :aria-current="index === currentIndex ? 'step' : undefined"
          @click="handleSelect(item, index)"
        >
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors"
            :class="stepBadgeClass(index)"
          >
            <UIcon v-if="isDoneStep(index)" name="i-mdi-check" class="size-3.5" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="text-xs font-medium">{{ stepLabel(item) }}</span>
        </button>
        <span
          v-if="index < steps.length - 1"
          aria-hidden="true"
          class="h-px min-w-2 flex-1 transition-colors"
          :class="index < currentIndex ? 'bg-success-500/45' : 'bg-white/10'"
        />
      </li>
    </ol>
  </nav>
</template>
<script setup lang="ts">
  import type { SetupStep } from '@/features/setup/useSetupCheckpoint';
  const props = defineProps<{
    steps: readonly SetupStep[];
    currentStep: SetupStep;
    disabled?: boolean;
  }>();
  const emit = defineEmits<{ select: [step: SetupStep] }>();
  const { t } = useI18n({ useScope: 'global' });
  const currentIndex = computed(() => {
    const idx = props.steps.indexOf(props.currentStep);
    return idx >= 0 ? idx : 0;
  });
  const progressPercent = computed(() =>
    props.steps.length > 0 ? Math.round(((currentIndex.value + 1) / props.steps.length) * 100) : 0
  );
  function stepLabel(step: SetupStep) {
    return t(`setup.stepper.${step.replaceAll('-', '_')}`);
  }
  function isDoneStep(index: number) {
    return (
      index < currentIndex.value || (props.currentStep === 'done' && index === currentIndex.value)
    );
  }
  function stepBadgeClass(index: number) {
    if (isDoneStep(index)) {
      return 'border-success-500/40 bg-success-500/15 text-success-300';
    }
    if (index === currentIndex.value) {
      return 'border-primary-400 bg-primary-500 text-surface-950 ring-2 ring-primary-500/25';
    }
    return 'border-white/12 bg-surface-800 text-surface-400';
  }
  function stepButtonClass(index: number) {
    if (index < currentIndex.value && !props.disabled) {
      return 'cursor-pointer text-surface-200 hover:bg-surface-800/80 hover:text-surface-50';
    }
    if (index === currentIndex.value) {
      return 'cursor-default text-surface-50';
    }
    return 'cursor-default text-surface-400';
  }
  function handleSelect(item: SetupStep, index: number) {
    if (props.disabled || index >= currentIndex.value) return;
    emit('select', item);
  }
</script>
