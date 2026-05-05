<template>
  <aside
    ref="drawerRef"
    tabindex="-1"
    :role="isOverlayMode ? 'dialog' : 'complementary'"
    :aria-modal="isOverlayMode ? 'true' : undefined"
    aria-labelledby="hideout-settings-drawer-title"
    data-help-target="hideout-settings-panel"
    class="overflow-y-auto backdrop-blur-sm"
    :class="
      isOverlayMode
        ? 'bg-surface-900/96 fixed right-3 bottom-3 left-3 z-40 flex max-h-[72vh] flex-col rounded-[28px] border border-white/10 p-4 shadow-2xl sm:top-24 sm:right-4 sm:bottom-4 sm:left-auto sm:max-h-[calc(100vh-7rem)] sm:w-96'
        : 'bg-surface-800/95 sticky top-6 max-h-[calc(100vh-3rem)] w-full rounded-lg border border-white/10 p-4 shadow-xl'
    "
    @keydown="handleKeydown"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 id="hideout-settings-drawer-title" class="text-sm font-semibold text-white">
        {{ copy('page.hideout.settings.title', 'Hideout settings') }}
      </h2>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-mdi-close"
        size="xs"
        :aria-label="t('common.close')"
        @click="handleClose"
      />
    </div>
    <div class="space-y-3">
      <section class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
        <div class="mb-2 flex items-center gap-2">
          <UIcon name="i-mdi-tune-variant" class="text-info-400 h-4 w-4" />
          <h3 class="text-xs font-semibold tracking-wide text-white uppercase">
            {{ copy('page.hideout.settings.page_options', 'Page options') }}
          </h3>
        </div>
        <div class="space-y-1">
          <label
            class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
          >
            <UCheckbox v-model="collapseCompleted" color="success" :disabled="isHelpTourActive" />
            <span class="text-surface-200 text-sm">
              {{ copy('page.hideout.collapse_completed', 'Collapse completed stations') }}
            </span>
          </label>
          <label
            class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
          >
            <UCheckbox v-model="sortReadyFirst" color="info" :disabled="isHelpTourActive" />
            <span class="text-surface-200 text-sm">
              {{ copy('page.hideout.sort.ready_first', 'Sort ready to build first') }}
            </span>
          </label>
        </div>
      </section>
      <section class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
        <div class="mb-2 flex items-center gap-2">
          <UIcon name="i-mdi-lock-outline" class="text-primary-400 h-4 w-4" />
          <h3 class="text-xs font-semibold tracking-wide text-white uppercase">
            {{ copy('page.hideout.prereq_filters.title', 'Availability requirements') }}
          </h3>
        </div>
        <p class="text-surface-500 mb-2 text-xs">
          {{
            copy(
              'page.hideout.settings.requirements_help',
              'These options decide how strict the hideout page is when it marks stations as available or locked.'
            )
          }}
        </p>
        <div class="space-y-1">
          <label
            class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
          >
            <UCheckbox v-model="requireStationLevels" :disabled="isHelpTourActive" />
            <span class="text-surface-200 text-sm">
              {{ copy('page.hideout.prereq_filters.station_levels', 'Require station levels') }}
            </span>
          </label>
          <label
            class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
          >
            <UCheckbox v-model="requireSkillLevels" :disabled="isHelpTourActive" />
            <span class="text-surface-200 text-sm">
              {{ copy('page.hideout.prereq_filters.skill_levels', 'Require skill levels') }}
            </span>
          </label>
          <label
            class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
          >
            <UCheckbox v-model="requireTraderLoyalty" :disabled="isHelpTourActive" />
            <span class="text-surface-200 text-sm">
              {{ copy('page.hideout.prereq_filters.trader_loyalty', 'Require trader loyalty') }}
            </span>
          </label>
        </div>
      </section>
    </div>
  </aside>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  interface Props {
    collapseCompleted: boolean;
    isHelpTourActive?: boolean;
    mode?: 'overlay' | 'docked';
    requireSkillLevels: boolean;
    requireStationLevels: boolean;
    requireTraderLoyalty: boolean;
    sortReadyFirst: boolean;
  }
  const props = withDefaults(defineProps<Props>(), {
    isHelpTourActive: false,
    mode: 'overlay',
  });
  const emit = defineEmits<{
    'update:collapseCompleted': [value: boolean];
    'update:requireSkillLevels': [value: boolean];
    'update:requireStationLevels': [value: boolean];
    'update:requireTraderLoyalty': [value: boolean];
    'update:sortReadyFirst': [value: boolean];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { close } = usePageSettingsDrawer('hideout');
  const drawerRef = ref<HTMLElement | null>(null);
  const isOverlayMode = computed(() => props.mode === 'overlay');
  const { restoreTriggerFocus, trapFocus } = useOverlayFocusTrap({
    containerRef: drawerRef,
    isOverlayMode,
  });
  const copy = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const collapseCompleted = computed({
    get: () => props.collapseCompleted,
    set: (value: boolean) => emit('update:collapseCompleted', value),
  });
  const sortReadyFirst = computed({
    get: () => props.sortReadyFirst,
    set: (value: boolean) => emit('update:sortReadyFirst', value),
  });
  const requireStationLevels = computed({
    get: () => props.requireStationLevels,
    set: (value: boolean) => emit('update:requireStationLevels', value),
  });
  const requireSkillLevels = computed({
    get: () => props.requireSkillLevels,
    set: (value: boolean) => emit('update:requireSkillLevels', value),
  });
  const requireTraderLoyalty = computed({
    get: () => props.requireTraderLoyalty,
    set: (value: boolean) => emit('update:requireTraderLoyalty', value),
  });
  const handleClose = () => {
    close();
    nextTick(() => {
      restoreTriggerFocus();
    });
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }
    trapFocus(event);
  };
</script>
