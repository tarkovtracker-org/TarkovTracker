<template>
  <aside
    ref="drawerRef"
    tabindex="-1"
    :role="isOverlayMode ? 'dialog' : 'complementary'"
    :aria-modal="isOverlayMode ? 'true' : undefined"
    aria-labelledby="needed-items-settings-drawer-title"
    class="bg-surface-800/95 w-72 overflow-y-auto rounded-lg border border-white/10 p-4 shadow-xl backdrop-blur-sm"
    :class="
      isOverlayMode
        ? 'fixed top-1/2 right-4 z-40 h-fit max-h-[calc(100vh-6rem)] -translate-y-1/2'
        : 'sticky top-6 max-h-[calc(100vh-3rem)]'
    "
    @keydown="handleKeydown"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 id="needed-items-settings-drawer-title" class="text-sm font-semibold text-white">
        {{ t('page.needed_items.settings.title', 'Needed Items Settings') }}
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
      <div class="rounded-lg border border-white/10 p-3">
        <div class="mb-2">
          <h3 class="text-surface-200 text-[10px] font-semibold tracking-wider uppercase">
            {{ t('page.needed_items.filters.label') }}
          </h3>
        </div>
        <div class="space-y-2">
          <div
            class="bg-surface-900/60 flex items-center gap-1 rounded-md border border-white/10 p-1"
          >
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              class="flex-1"
              :class="firFilter === 'all' ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="firFilter = 'all'"
            >
              {{ t('page.tasks.primary_views.all') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              class="flex-1"
              :class="firFilter === 'fir' ? 'bg-white/10 text-white' : 'text-surface-300'"
              @click="firFilter = 'fir'"
            >
              {{ t('page.needed_items.filters.fir') }}
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              class="flex-1"
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
      <div class="rounded-lg border border-white/10 p-3">
        <div class="mb-2">
          <h3 class="text-surface-200 text-[10px] font-semibold tracking-wider uppercase">
            {{ t('page.tasks.settings.tabs.appearance') }}
          </h3>
        </div>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-mdi-view-list"
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
              size="xs"
              icon="i-mdi-view-grid"
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
              size="xs"
              icon="i-mdi-group"
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
            size="xs"
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
  import { useI18n } from 'vue-i18n';
  import { useNeededItemsSettingsDrawer } from '@/composables/useNeededItemsSettingsDrawer';
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
  const { close } = useNeededItemsSettingsDrawer();
  const isOverlayMode = computed(() => props.mode === 'overlay');
  const drawerRef = ref<HTMLElement | null>(null);
  const triggerElement = ref<HTMLElement | null>(null);
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
  const focusDrawer = async () => {
    await nextTick();
    drawerRef.value?.focus({ preventScroll: true });
  };
  const storeTriggerElement = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && !drawerRef.value?.contains(activeElement)) {
      triggerElement.value = activeElement;
    }
  };
  const restoreTriggerFocus = () => {
    const trigger = triggerElement.value;
    if (!trigger || !document.contains(trigger)) return;
    trigger.focus({ preventScroll: true });
  };
  const handleClose = () => {
    close();
    if (!isOverlayMode.value) return;
    nextTick(() => {
      restoreTriggerFocus();
    });
  };
  const getFocusableElements = () => {
    const drawer = drawerRef.value;
    if (!drawer) return [];
    return Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }
    if (!isOverlayMode.value) return;
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      drawerRef.value?.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const activeElement = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (activeElement === first || activeElement === drawerRef.value) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
      return;
    }
    if (activeElement === last || activeElement === drawerRef.value) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  onMounted(() => {
    if (!isOverlayMode.value) return;
    storeTriggerElement();
    focusDrawer();
  });
</script>
