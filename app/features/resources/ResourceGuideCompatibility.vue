<template>
  <div
    v-if="text"
    class="bg-warning-500/10 border-warning-400/20 text-surface-200 flex items-start gap-3 rounded-xl border px-4 py-3 text-base leading-relaxed"
  >
    <UIcon name="i-mdi-alert-circle-outline" class="text-warning-400 mt-0.5 h-5 w-5 shrink-0" />
    <p>
      <span class="text-warning-200 font-semibold">
        {{ t('page.resources.compatibility_label', 'Compatibility') }}:
      </span>
      {{ text }}
    </p>
  </div>
</template>
<script setup lang="ts">
  defineProps<{ text: string }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
