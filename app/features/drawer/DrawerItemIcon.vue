<template>
  <div :class="['flex shrink-0 items-center justify-center', sizeClass]">
    <NuxtImg
      v-if="avatar"
      :src="avatar"
      :alt="avatarAlt ?? ''"
      class="h-6 w-6 rounded-full"
      width="24"
      height="24"
    />
    <img
      v-else-if="iconSrc"
      :src="iconSrc"
      alt=""
      width="24"
      height="24"
      class="light:invert size-6 object-contain"
    />
    <UIcon
      v-else-if="icon?.startsWith('i-')"
      :name="icon"
      class="h-6 w-6 transition-colors"
      :class="colorClass"
    />
    <span v-else :class="[iconClass, colorClass]" />
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    icon?: string;
    iconSrc?: string;
    avatar?: string | null;
    avatarAlt?: string;
    colorClass?: string;
    hasMargin?: boolean;
  }>();
  const sizeClass = computed(() => (props.hasMargin ? 'mr-3 w-6' : 'w-6'));
  const iconClass = computed(() => {
    if (!props.icon) {
      return ['mdi', 'mdi-help-circle', 'text-2xl'];
    }
    return ['mdi', props.icon, 'text-2xl'];
  });
</script>
