<template>
  <div
    class="bg-surface-900 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/12 px-3 py-2 shadow-sm sm:px-4"
  >
    <span class="text-surface-300 text-xs sm:text-sm">
      {{ t(noticeKey, { count }) }}
    </span>
    <UButton
      variant="soft"
      color="neutral"
      size="xs"
      :icon="actionIcon"
      :aria-label="t(actionLabelKey)"
      @click="$emit('toggle')"
    >
      {{ t(actionLabelKey) }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    count: number;
    isHiding: boolean;
  }>();
  defineEmits<{
    toggle: [];
  }>();
  const noticeKey = computed(() =>
    props.isHiding
      ? 'page.tasks.map.map_complete_tasks_hidden'
      : 'page.tasks.map.map_complete_tasks_showing'
  );
  const actionLabelKey = computed(() =>
    props.isHiding
      ? 'page.tasks.map.map_complete_tasks_toggle_show'
      : 'page.tasks.map.map_complete_tasks_toggle_hide'
  );
  const actionIcon = computed(() => (props.isHiding ? 'i-mdi-eye' : 'i-mdi-eye-off'));
</script>
