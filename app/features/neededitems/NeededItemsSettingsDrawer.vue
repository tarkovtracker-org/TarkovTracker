<template>
  <aside
    ref="drawerRef"
    tabindex="-1"
    :role="isOverlayMode ? 'dialog' : 'complementary'"
    :aria-modal="isOverlayMode ? 'true' : undefined"
    aria-labelledby="needed-items-settings-drawer-title"
    class="overflow-y-auto backdrop-blur-sm"
    :class="
      isOverlayMode
        ? 'bg-surface-900/96 fixed right-3 bottom-3 left-3 z-40 flex max-h-[72vh] flex-col rounded-[28px] border border-white/10 p-4 shadow-2xl sm:top-24 sm:right-4 sm:bottom-4 sm:left-auto sm:max-h-[calc(100vh-7rem)] sm:w-96'
        : 'bg-surface-900/98 h-full w-full rounded-2xl border border-white/8 p-5 shadow-2xl'
    "
    @keydown="handleKeydown"
  >
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2
        id="needed-items-settings-drawer-title"
        class="text-base font-semibold tracking-[0.04em] text-white"
      >
        {{ t('page.needed_items.settings.title') }}
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
      <div class="rounded-2xl border border-white/10 p-4">
        <div class="mb-3">
          <h3 class="text-surface-200 text-[11px] font-semibold tracking-[0.18em] uppercase">
            {{ t('page.needed_items.filters.label') }}
          </h3>
        </div>
        <div class="space-y-3">
          <div
            role="group"
            :aria-label="t('page.needed_items.filters.label')"
            class="bg-surface-900/60 flex items-center gap-1 rounded-lg border border-white/10 p-1"
          >
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              class="flex-1"
              :aria-pressed="firFilter === 'all'"
              :class="firFilter === 'all' ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="firFilter = 'all'"
            >
              {{ t('page.needed_items.filters.all') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              class="flex-1"
              :aria-pressed="firFilter === 'fir'"
              :class="firFilter === 'fir' ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="firFilter = 'fir'"
            >
              {{ t('page.needed_items.filters.fir') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              class="flex-1"
              :aria-pressed="firFilter === 'non-fir'"
              :class="firFilter === 'non-fir' ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="firFilter = 'non-fir'"
            >
              {{ t('page.needed_items.filters.non_fir') }}
            </UButton>
          </div>
          <UCheckbox v-model="hideOwned" :label="t('page.needed_items.filters.hide_owned')" />
          <UCheckbox
            v-model="hideNonFirSpecialEquipment"
            :label="t('page.needed_items.filters.hide_non_fir_special_equipment_title')"
          />
          <AppTooltip
            :text="
              isKappaDisabled
                ? t('page.needed_items.filters.kappa_only_disabled_tooltip')
                : t('page.needed_items.filters.kappa_only_tooltip')
            "
          >
            <div>
              <UCheckbox
                v-model="kappaOnly"
                :label="t('page.needed_items.filters.kappa_only')"
                :disabled="isKappaDisabled"
              />
            </div>
          </AppTooltip>
          <UCheckbox
            v-model="hideTeamItems"
            :label="t('page.needed_items.filters.hide_team_needs')"
          />
        </div>
      </div>
      <div class="rounded-2xl border border-white/10 p-4">
        <div class="mb-3">
          <h3 class="text-surface-200 text-[11px] font-semibold tracking-[0.18em] uppercase">
            {{ t('page.tasks.settings.tabs.appearance') }}
          </h3>
        </div>
        <div class="space-y-3">
          <div
            role="group"
            :aria-label="t('page.tasks.settings.tabs.appearance')"
            class="flex flex-wrap gap-2"
          >
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-mdi-view-list"
              :aria-pressed="!groupByItem && viewMode === 'list'"
              :class="
                !groupByItem && viewMode === 'list' ? 'bg-white/10 text-white' : 'text-surface-300'
              "
              @click="setListView"
            >
              {{ t('page.needed_items.view.list') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-mdi-view-grid"
              :aria-pressed="!groupByItem && viewMode === 'grid'"
              :class="
                !groupByItem && viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-surface-300'
              "
              @click="setGridView"
            >
              {{ t('page.needed_items.view.grid') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-mdi-group"
              :aria-pressed="groupByItem"
              :class="groupByItem ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="setGroupedView"
            >
              {{ t('page.needed_items.view.combined') }}
            </UButton>
          </div>
          <UButton
            v-if="!groupByItem && viewMode === 'grid'"
            variant="soft"
            color="neutral"
            size="sm"
            :icon="cardStyle === 'compact' ? 'i-mdi-image' : 'i-mdi-image-text'"
            class="justify-start"
            @click="toggleCardStyle"
          >
            {{
              cardStyle === 'compact'
                ? t('needed_items.switch_to_expanded')
                : t('needed_items.switch_to_compact')
            }}
          </UButton>
        </div>
      </div>
    </div>
  </aside>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  type FilterType = 'all' | 'tasks' | 'hideout' | 'completed';
  type ViewMode = 'list' | 'grid';
  type FirFilter = 'all' | 'fir' | 'non-fir';
  type CardStyle = 'compact' | 'expanded';
  interface Props {
    mode?: 'overlay' | 'docked';
    activeFilter: FilterType;
    firFilter: FirFilter;
    hideOwned: boolean;
    hideNonFirSpecialEquipment: boolean;
    hideTeamItems: boolean;
    kappaOnly: boolean;
    viewMode: ViewMode;
    groupByItem: boolean;
    cardStyle: CardStyle;
  }
  const props = withDefaults(defineProps<Props>(), {
    mode: 'overlay',
  });
  const emit = defineEmits<{
    'update:firFilter': [value: FirFilter];
    'update:hideOwned': [value: boolean];
    'update:hideNonFirSpecialEquipment': [value: boolean];
    'update:hideTeamItems': [value: boolean];
    'update:kappaOnly': [value: boolean];
    'update:viewMode': [value: ViewMode];
    'update:groupByItem': [value: boolean];
    'update:cardStyle': [value: CardStyle];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { close } = usePageSettingsDrawer('needed_items');
  const isOverlayMode = computed(() => props.mode === 'overlay');
  const drawerRef = ref<HTMLElement | null>(null);
  const { restoreTriggerFocus, trapFocus } = useOverlayFocusTrap({
    containerRef: drawerRef,
    isOverlayMode,
  });
  const firFilter = computed({
    get: () => props.firFilter,
    set: (value: FirFilter) => emit('update:firFilter', value),
  });
  const hideOwned = computed({
    get: () => props.hideOwned,
    set: (value: boolean) => emit('update:hideOwned', value),
  });
  const hideNonFirSpecialEquipment = computed({
    get: () => props.hideNonFirSpecialEquipment,
    set: (value: boolean) => emit('update:hideNonFirSpecialEquipment', value),
  });
  const hideTeamItems = computed({
    get: () => props.hideTeamItems,
    set: (value: boolean) => emit('update:hideTeamItems', value),
  });
  const kappaOnly = computed({
    get: () => props.kappaOnly,
    set: (value: boolean) => emit('update:kappaOnly', value),
  });
  const viewMode = computed({
    get: () => props.viewMode,
    set: (value: ViewMode) => emit('update:viewMode', value),
  });
  const groupByItem = computed({
    get: () => props.groupByItem,
    set: (value: boolean) => emit('update:groupByItem', value),
  });
  const cardStyle = computed({
    get: () => props.cardStyle,
    set: (value: CardStyle) => emit('update:cardStyle', value),
  });
  const isKappaDisabled = computed(() => props.activeFilter === 'hideout');
  const setListView = () => {
    groupByItem.value = false;
    viewMode.value = 'list';
  };
  const setGridView = () => {
    groupByItem.value = false;
    viewMode.value = 'grid';
  };
  const setGroupedView = () => {
    groupByItem.value = true;
  };
  const toggleCardStyle = () => {
    cardStyle.value = cardStyle.value === 'compact' ? 'expanded' : 'compact';
  };
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
