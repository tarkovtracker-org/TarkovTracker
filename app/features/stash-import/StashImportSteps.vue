<template>
  <ol
    class="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm"
    :aria-label="$t('stash_import.steps_label')"
  >
    <li
      v-for="(entry, index) in steps"
      :key="entry"
      class="flex min-w-0 items-center gap-2"
      :aria-current="entry === current ? 'step' : undefined"
    >
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
        :class="badgeClass(index)"
      >
        <UIcon v-if="index < position" name="i-mdi-check" class="size-4" />
        <template v-else>{{ index + 1 }}</template>
      </span>
      <span
        class="truncate"
        :class="[
          index === position ? 'text-surface-100 font-semibold' : 'text-surface-400',
          index === position ? '' : 'hidden sm:inline',
        ]"
      >
        {{ $t(`stash_import.step_${entry}`) }}
      </span>
      <span
        v-if="index < steps.length - 1"
        class="bg-surface-600 hidden h-px w-6 shrink-0 sm:block lg:w-10"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
<script setup lang="ts">
  const props = defineProps<{ current: 'intake' | 'review' | 'apply' | 'done' }>();
  const steps = ['intake', 'review', 'apply'] as const;
  const position = computed(() =>
    props.current === 'done' ? steps.length : steps.indexOf(props.current)
  );
  function badgeClass(index: number) {
    if (index < position.value) return 'border-success-500 bg-success-500/15 text-success-300';
    if (index === position.value) return 'border-primary-400 bg-primary-500/15 text-primary-200';
    return 'border-surface-600 text-surface-400';
  }
</script>
