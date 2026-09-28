<template>
  <section
    data-testid="map-hidden-tasks-section"
    class="border-warning-500/30 bg-warning-500/5 mb-6 rounded-lg border"
  >
    <div class="flex flex-wrap items-center gap-2 px-3 py-2">
      <button
        type="button"
        data-testid="map-hidden-tasks-toggle"
        class="focus-visible:ring-primary-500 flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2"
        :aria-expanded="isExpanded"
        :aria-label="
          isExpanded
            ? t('page.tasks.map.raid_plan.hidden_section_collapse')
            : t('page.tasks.map.raid_plan.hidden_section_expand')
        "
        @click="isExpanded = !isExpanded"
      >
        <UIcon
          :name="isExpanded ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'"
          class="text-surface-400 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <UIcon name="i-mdi-eye-off-outline" class="text-warning-300 h-4 w-4 shrink-0" />
        <span class="text-surface-100 text-sm font-medium">
          {{ t('page.tasks.map.raid_plan.hidden_section_title', { count }) }}
        </span>
        <span class="text-surface-400 hidden truncate text-xs sm:inline">
          {{ t('page.tasks.map.raid_plan.hidden_section_description') }}
        </span>
      </button>
      <UButton
        data-testid="map-hidden-tasks-show-all"
        size="xs"
        color="warning"
        variant="soft"
        icon="i-mdi-eye-refresh-outline"
        @click="$emit('show-all')"
      >
        {{ t('page.tasks.map.raid_plan.show_all') }}
      </UButton>
    </div>
    <div v-if="isExpanded" class="px-3 pb-3 opacity-80">
      <slot />
    </div>
  </section>
</template>
<script setup lang="ts">
  defineProps<{
    count: number;
  }>();
  defineEmits<{
    'show-all': [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const isExpanded = ref(false);
</script>
