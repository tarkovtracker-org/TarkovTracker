<template>
  <div
    role="menuitem"
    :class="itemClasses"
    :aria-disabled="props.disabled ? 'true' : 'false'"
    :tabindex="props.disabled ? -1 : 0"
    @click="handleClick"
    @keydown="handleKeydown"
    @keyup="handleKeyup"
  >
    <img v-if="isImagePath" :src="icon" :alt="label" class="h-4 w-4 shrink-0" />
    <UIcon v-else-if="icon" :name="icon" class="h-4 w-4 shrink-0" />
    <span>{{ label }}</span>
  </div>
</template>
<script setup lang="ts">
  interface Props {
    label: string;
    icon?: string;
    disabled?: boolean;
  }
  const props = defineProps<Props>();
  const emit = defineEmits<{
    click: [];
  }>();
  const isImagePath = computed(() => {
    if (!props.icon) return false;
    return (
      props.icon.startsWith('/') ||
      props.icon.startsWith('http') ||
      props.icon.endsWith('.webp') ||
      props.icon.endsWith('.png') ||
      props.icon.endsWith('.svg') ||
      props.icon.endsWith('.jpg') ||
      props.icon.endsWith('.jpeg')
    );
  });
  const itemClasses = computed(() => [
    'flex items-center gap-2 px-4 py-2.5 text-sm text-foreground-muted transition-colors duration-150',
    props.disabled
      ? 'cursor-not-allowed opacity-60'
      : 'cursor-pointer hover:bg-interactive hover:text-foreground focus-visible:bg-interactive focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
  ]);
  const handleClick = () => {
    if (props.disabled) return;
    emit('click');
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (props.disabled) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      emit('click');
    } else if (event.key === ' ') {
      event.preventDefault();
    }
  };
  const handleKeyup = (event: KeyboardEvent) => {
    if (props.disabled) return;
    if (event.key === ' ') {
      event.preventDefault();
      emit('click');
    }
  };
</script>
