<template>
  <button
    type="button"
    class="border-default bg-default text-muted enabled:hover:bg-elevated focus-visible:outline-primary min-w-0 cursor-pointer rounded-md border text-center text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    :class="TONE_CLASSES[tone]"
  >
    <slot />
  </button>
</template>
<script setup lang="ts">
  type ChoiceTone = 'primary' | 'pvp' | 'pve' | 'warning';
  /** Selected-state colors; kept literal so Tailwind can discover every class. */
  const TONE_CLASSES: Record<ChoiceTone, string> = {
    primary:
      'aria-pressed:border-primary/70 aria-pressed:bg-primary/10 aria-pressed:text-highlighted',
    pvp: 'aria-pressed:border-pvp-500/70 aria-pressed:bg-pvp-500/10 aria-pressed:text-pvp-300',
    pve: 'aria-pressed:border-pve-500/70 aria-pressed:bg-pve-500/10 aria-pressed:text-pve-300',
    warning:
      'aria-pressed:border-warning-500/70 aria-pressed:bg-warning-500/10 aria-pressed:text-warning-300',
  };
  const { tone = 'primary' } = defineProps<{ tone?: ChoiceTone }>();
</script>
