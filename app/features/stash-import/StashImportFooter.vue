<template>
  <footer
    class="bg-surface-900 flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 sm:px-5"
  >
    <UButton
      v-if="back"
      variant="ghost"
      color="neutral"
      :icon="back.icon"
      :disabled="back.disabled"
      @click="back.run()"
    >
      {{ back.label }}
    </UButton>
    <p
      v-if="hint"
      class="order-first w-full text-xs sm:order-none sm:w-auto sm:flex-1 sm:text-right"
      :class="hintTone"
    >
      {{ hint }}
    </p>
    <UButton
      v-if="primary"
      class="ml-auto sm:ml-0"
      :class="hint ? '' : 'sm:ml-auto'"
      :data-testid="primary.testid"
      :variant="primary.variant ?? 'solid'"
      :color="primary.variant ? 'neutral' : 'primary'"
      :icon="primary.icon"
      :trailing-icon="primary.trailingIcon"
      :loading="primary.loading"
      :disabled="primary.disabled"
      @click="primary.run()"
    >
      {{ primary.label }}
    </UButton>
  </footer>
</template>
<script setup lang="ts">
  export interface FooterAction {
    label: string;
    run: () => unknown;
    icon?: string;
    trailingIcon?: string;
    testid?: string;
    variant?: 'ghost' | 'soft';
    disabled?: boolean;
    loading?: boolean;
  }
  defineProps<{ back?: FooterAction; primary?: FooterAction; hint?: string; hintTone?: string }>();
</script>
