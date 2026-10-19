<template>
  <section
    :data-testid="`${testIdPrefix}-section`"
    class="border-warning-500/30 bg-warning-500/5 mb-6 rounded-lg border"
  >
    <div class="flex flex-wrap items-center gap-2 px-3 py-2">
      <button
        type="button"
        :data-testid="`${testIdPrefix}-toggle`"
        class="focus-visible:ring-primary-500 flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2"
        :aria-expanded="isExpanded"
        :aria-label="isExpanded ? t(copy.collapse) : t(copy.expand)"
        @click="isExpanded = !isExpanded"
      >
        <UIcon
          :name="isExpanded ? 'i-mdi-chevron-down' : 'i-mdi-chevron-right'"
          class="text-surface-400 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <UIcon name="i-mdi-eye-off-outline" class="text-warning-300 h-4 w-4 shrink-0" />
        <span class="text-surface-100 text-sm font-medium">
          {{ t(copy.title, { count }) }}
        </span>
        <span class="text-surface-400 hidden truncate text-xs sm:inline">
          {{ t(copy.description) }}
        </span>
      </button>
      <UButton
        :data-testid="`${testIdPrefix}-show-all`"
        size="xs"
        color="warning"
        variant="soft"
        icon="i-mdi-eye-refresh-outline"
        @click="$emit('show-all')"
      >
        {{ t(copy.showAll) }}
      </UButton>
    </div>
    <div v-if="isExpanded" class="px-3 pb-3 opacity-80">
      <slot />
    </div>
  </section>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      count: number;
      /** `map`: quests hidden from the map; `list`: quests the user hid from task lists. */
      variant?: 'map' | 'list';
    }>(),
    { variant: 'map' }
  );
  defineEmits<{
    'show-all': [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const COPY = {
    map: {
      title: 'page.tasks.map.raid_plan.hidden_section_title',
      description: 'page.tasks.map.raid_plan.hidden_section_description',
      expand: 'page.tasks.map.raid_plan.hidden_section_expand',
      collapse: 'page.tasks.map.raid_plan.hidden_section_collapse',
      showAll: 'page.tasks.map.raid_plan.show_all',
    },
    list: {
      title: 'page.tasks.hidden_tasks.section_title',
      description: 'page.tasks.hidden_tasks.section_description',
      expand: 'page.tasks.hidden_tasks.section_expand',
      collapse: 'page.tasks.hidden_tasks.section_collapse',
      showAll: 'page.tasks.hidden_tasks.unhide_all',
    },
  } as const;
  const copy = computed(() => COPY[props.variant]);
  const testIdPrefix = computed(() =>
    props.variant === 'map' ? 'map-hidden-tasks' : 'user-hidden-tasks'
  );
  const isExpanded = ref(false);
</script>
