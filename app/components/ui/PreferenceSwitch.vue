<template>
  <label
    :data-testid="testId"
    class="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors"
    :class="disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-700/40 cursor-pointer'"
  >
    <span class="min-w-0 flex-1">
      <span class="text-surface-100 block text-sm">{{ label }}</span>
      <span
        v-if="description"
        :id="descriptionId"
        class="text-surface-400 block text-xs leading-snug"
      >
        {{ description }}
      </span>
    </span>
    <USwitch
      v-model="model"
      size="sm"
      color="primary"
      class="mt-0.5"
      :disabled="disabled"
      :aria-label="label"
      :aria-describedby="description ? descriptionId : undefined"
    />
  </label>
</template>
<script setup lang="ts">
  defineProps<{
    label: string;
    description?: string;
    disabled?: boolean;
    testId?: string;
  }>();
  const model = defineModel<boolean>({ required: true });
  const descriptionId = useId();
</script>
