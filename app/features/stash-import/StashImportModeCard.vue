<template>
  <label
    :data-testid="`stash-mode-${mode}`"
    class="has-focus-visible:ring-primary-400 flex cursor-pointer gap-3 rounded-lg border-2 p-3 transition-colors has-focus-visible:ring-2"
    :class="tone.card"
  >
    <input
      type="radio"
      name="stash-import-mode"
      :value="mode"
      :checked="selected"
      class="sr-only"
      @change="$emit('select')"
    />
    <UIcon :name="icon" class="mt-0.5 size-6 shrink-0" :class="tone.icon" />
    <span class="min-w-0 space-y-1">
      <span class="text-surface-50 block font-semibold">
        {{ $t(`stash_import.mode_${mode}`) }}
      </span>
      <span class="text-surface-300 block text-sm">
        {{ $t(`stash_import.mode_${mode}_help`) }}
      </span>
      <span class="text-surface-400 block text-xs">
        {{ $t(`stash_import.mode_${mode}_when`) }}
      </span>
      <span class="block pt-1 text-xs font-semibold" :class="impactTone">{{ impact }}</span>
    </span>
  </label>
</template>
<script setup lang="ts">
  import type { ImportMode } from '@/features/stash-import/useStashImport';
  const props = defineProps<{
    mode: ImportMode;
    icon: string;
    selected: boolean;
    impact: string;
    impactTone: string;
  }>();
  defineEmits<{ select: [] }>();
  const tone = computed(() =>
    props.selected
      ? { card: 'border-primary-400 bg-primary-500/10', icon: 'text-primary-300' }
      : {
          card: 'border-surface-700 bg-surface-850 hover:border-surface-500',
          icon: 'text-surface-400',
        }
  );
</script>
