<template>
  <button
    type="button"
    role="switch"
    class="text-primary-400 focus-visible:outline-primary-500 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    :aria-label="label"
    :aria-checked="modelValue"
    :disabled="disabled"
    :data-state="modelValue ? 'checked' : 'unchecked'"
    @click="toggle"
  >
    <span
      aria-hidden="true"
      class="bg-surface-600 data-[state=checked]:bg-success-500 relative flex h-5 w-10 shrink-0 items-center rounded-full transition-colors duration-200"
      :data-state="modelValue ? 'checked' : 'unchecked'"
    >
      <span
        class="bg-default size-4.5 rounded-full shadow-lg transition-transform duration-200"
        :class="modelValue ? 'translate-x-4.5' : 'translate-x-0'"
      />
    </span>
  </button>
</template>
<script setup lang="ts">
  const emit = defineEmits<{
    'update:modelValue': [value: boolean];
  }>();
  const props = defineProps<{
    disabled?: boolean;
    label: string;
    modelValue: boolean;
  }>();
  const toggle = () => {
    if (!props.disabled) emit('update:modelValue', !props.modelValue);
  };
</script>
