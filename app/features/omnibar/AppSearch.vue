<template>
  <div
    class="relative min-w-0 sm:w-full sm:max-w-sm lg:max-w-md"
    :class="
      isFocused ? 'max-sm:absolute max-sm:inset-x-2 max-sm:top-1.5 max-sm:z-50' : 'max-sm:w-8'
    "
    data-testid="app-search"
    @focusout="onFocusOut"
  >
    <UInput
      ref="searchInput"
      v-model="draft"
      role="combobox"
      aria-autocomplete="list"
      autocomplete="off"
      enterkeyhint="search"
      icon="i-heroicons-magnifying-glass"
      size="sm"
      class="w-full"
      :placeholder="t('omnibar.placeholder')"
      :aria-label="t('omnibar.aria_label')"
      :aria-expanded="isDropdownVisible"
      :aria-controls="listboxId"
      :aria-activedescendant="activeOption?.domId"
      :aria-keyshortcuts="props.keyShortcuts"
      :ui="{
        base: isFocused ? 'h-8' : 'h-8 max-sm:text-transparent max-sm:placeholder:text-transparent',
        trailing: isFocused ? 'pe-1' : 'pe-1 max-sm:hidden',
      }"
      data-testid="app-search-input"
      @focus="onFocus"
      @click="onFocus"
      @keydown="onKeydown"
    >
      <template #trailing>
        <UButton
          v-if="draft"
          color="neutral"
          variant="link"
          size="xs"
          icon="i-mdi-close-circle"
          :aria-label="t('common.clear_search')"
          @mousedown.prevent
          @click="clearDraft"
        />
        <span v-else class="hidden items-center gap-0.5 lg:flex" aria-hidden="true">
          <template v-for="(part, index) in props.shortcutParts" :key="index">
            <span v-if="index > 0" class="text-surface-500 text-[10px]">+</span>
            <UKbd size="sm">{{ part }}</UKbd>
          </template>
        </span>
      </template>
    </UInput>
    <span
      v-if="draft && !isFocused"
      class="bg-primary-500 pointer-events-none absolute top-1 right-1 size-1.5 rounded-full sm:hidden"
      aria-hidden="true"
    />
    <AppSearchResults
      v-show="isDropdownVisible"
      :listbox-id="listboxId"
      :label="t('omnibar.aria_label')"
      :groups="groups"
      :active-index="activeIndex"
      :empty-message="emptyMessage"
      @hover="activeIndex = $event"
      @select="select"
    />
  </div>
</template>
<script setup lang="ts">
  import { FOCUS_APP_SEARCH_EVENT } from '@/composables/useKeybinds';
  import { useRouteSearchQuery } from '@/composables/useRouteSearchQuery';
  import AppSearchResults from '@/features/omnibar/AppSearchResults.vue';
  import { useOmnibarSearch } from '@/features/omnibar/useOmnibarSearch';
  import type {
    AppSearchGroup,
    AppSearchGroupId,
    AppSearchOption,
    AppSearchTarget,
  } from '@/features/omnibar/AppSearchResults.vue';
  import type { OmnibarContext } from '@/features/omnibar/useOmnibarSearch';
  import type { UInputInstance } from '@/types/ui';
  const props = defineProps<{
    shortcutParts: string[];
    keyShortcuts: string;
  }>();
  const MIN_QUERY_LENGTH = 2;
  // Long enough to batch keystrokes into one history entry, short enough to feel live.
  const ROUTE_WRITE_DELAY_MS = 150;
  // A page that filters itself by `?q=` leaves its own group out; the dropdown jumps elsewhere.
  const GROUP_ORDER: Record<OmnibarContext, AppSearchGroupId[]> = {
    tasks: ['items', 'hideout'],
    items: ['tasks', 'hideout'],
    hideout: ['hideout', 'tasks', 'items'],
    global: ['tasks', 'items', 'hideout'],
  };
  const PAGE_SEARCH_CONTEXTS: OmnibarContext[] = ['tasks', 'items'];
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const { searchQuery: draft, results, isPending, currentContext } = useOmnibarSearch();
  const { searchQuery: routeQuery, setSearchQuery } = useRouteSearchQuery();
  const isPageSearch = computed(() => PAGE_SEARCH_CONTEXTS.includes(currentContext.value));
  draft.value = isPageSearch.value ? routeQuery.value : '';
  const searchInput = ref<UInputInstance | null>(null);
  const listboxId = useId();
  const isFocused = ref(false);
  const isOpen = ref(false);
  const activeIndex = ref(-1);
  const groupLabels = computed<Record<AppSearchGroupId, string>>(() => ({
    tasks: t('omnibar.group_tasks'),
    items: t('common.needed_items'),
    hideout: t('omnibar.group_hideout'),
  }));
  const targetsByGroup = computed<Record<AppSearchGroupId, AppSearchTarget[]>>(() => ({
    tasks: results.value.tasks.map((task) => ({
      label: task.name ?? '',
      suffix: task.map?.name ?? undefined,
      icon: 'i-mdi-clipboard-text-outline',
      to: { path: '/tasks', query: { task: task.id } },
    })),
    items: results.value.items.map((item) => ({
      label: item.name ?? '',
      suffix: item.shortName ?? undefined,
      icon: 'i-mdi-package-variant-closed',
      to: { path: '/needed-items', query: { q: item.name ?? '' } },
    })),
    hideout: results.value.hideout.map((station) => ({
      label: station.name ?? '',
      icon: 'i-mdi-home-outline',
      to: { path: '/hideout', query: { station: station.id } },
    })),
  }));
  const groups = computed<AppSearchGroup[]>(() => {
    let nextIndex = 0;
    const toOption = (target: AppSearchTarget): AppSearchOption => {
      const index = nextIndex++;
      return { ...target, index, domId: `${listboxId}-option-${index}` };
    };
    return GROUP_ORDER[currentContext.value]
      .map((id) => ({
        id,
        label: groupLabels.value[id],
        options: targetsByGroup.value[id].map(toOption),
      }))
      .filter((group) => group.options.length > 0);
  });
  const options = computed(() => groups.value.flatMap((group) => group.options));
  const activeOption = computed<AppSearchOption | undefined>(
    () => options.value[activeIndex.value]
  );
  const hasMinQuery = computed(() => draft.value.trim().length >= MIN_QUERY_LENGTH);
  // On a page search the page itself shows the empty state, so only jump searches say so here.
  const showsNoResults = computed(
    () => !isPageSearch.value && !isPending.value && options.value.length === 0
  );
  const hasContent = computed(() => options.value.length > 0 || showsNoResults.value);
  const emptyMessage = computed(() =>
    showsNoResults.value ? t('omnibar.no_results', { query: draft.value.trim() }) : undefined
  );
  const isDropdownVisible = computed(
    () => isFocused.value && isOpen.value && hasMinQuery.value && hasContent.value
  );
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelWrite = () => {
    clearTimeout(writeTimer);
    writeTimer = undefined;
  };
  const writeRoute = () => {
    cancelWrite();
    void setSearchQuery(draft.value);
  };
  const scheduleWrite = () => {
    cancelWrite();
    writeTimer = setTimeout(writeRoute, ROUTE_WRITE_DELAY_MS);
  };
  // Leaving the box commits the typed query, so a status tab click right after typing sees it.
  const flushWrite = () => {
    if (writeTimer) writeRoute();
  };
  const isEnterQueued = ref(false);
  const close = () => {
    isOpen.value = false;
    activeIndex.value = -1;
    isEnterQueued.value = false;
  };
  const inputElement = () => searchInput.value?.inputRef ?? null;
  const focusInput = () => {
    inputElement()?.focus();
    inputElement()?.select();
  };
  // Only typing writes the route; route-driven draft updates happen while the input is blurred.
  watch(draft, () => {
    activeIndex.value = -1;
    if (!isFocused.value) return;
    isOpen.value = true;
    if (isPageSearch.value) scheduleWrite();
  });
  // Outside changes to `?q=` (the page's Clear hint, history) show up in the box.
  watch(routeQuery, (value) => {
    if (isFocused.value || !isPageSearch.value) return;
    cancelWrite();
    draft.value = value;
  });
  watch(
    () => route.path,
    () => {
      cancelWrite();
      close();
      draft.value = isPageSearch.value ? routeQuery.value : '';
    }
  );
  const onFocus = () => {
    isFocused.value = true;
    isOpen.value = true;
  };
  const onFocusOut = (event: FocusEvent) => {
    const root = event.currentTarget as HTMLElement;
    if (root.contains(event.relatedTarget as Node | null)) return;
    isFocused.value = false;
    flushWrite();
    close();
  };
  const select = (option: AppSearchOption) => {
    cancelWrite();
    inputElement()?.blur();
    // Clearing the draft must not write `?q=`, even if blur left focus where it was.
    isFocused.value = false;
    close();
    draft.value = '';
    void router.push(option.to);
  };
  const clearDraft = () => {
    draft.value = '';
    if (isPageSearch.value) writeRoute();
    focusInput();
  };
  const moveActive = (delta: number) => {
    isOpen.value = true;
    const count = options.value.length;
    if (count === 0) return;
    const current = activeIndex.value < 0 && delta < 0 ? count : activeIndex.value;
    activeIndex.value = (current + delta + count) % count;
  };
  // Enter on a page search applies the filter; elsewhere it jumps to the top result.
  const onEnter = () => {
    const option = activeOption.value ?? (isPageSearch.value ? undefined : options.value[0]);
    if (option) return select(option);
    if (isPageSearch.value) writeRoute();
    close();
  };
  // A jump search waits for the typed query's results instead of jumping to a stale one.
  const shouldWaitForResults = () => isPending.value && !isPageSearch.value && !activeOption.value;
  const onEnterKey = () => {
    if (shouldWaitForResults()) isEnterQueued.value = true;
    else onEnter();
  };
  watch(isPending, (pending) => {
    if (pending || !isEnterQueued.value) return;
    isEnterQueued.value = false;
    onEnter();
  });
  const onEscape = () => {
    if (isDropdownVisible.value) return close();
    inputElement()?.blur();
  };
  const KEY_HANDLERS: Record<string, () => void> = {
    ArrowDown: () => moveActive(1),
    ArrowUp: () => moveActive(-1),
    Enter: onEnterKey,
    Escape: onEscape,
  };
  const onKeydown = (event: KeyboardEvent) => {
    const handler = KEY_HANDLERS[event.key];
    if (!handler || event.isComposing) return;
    event.preventDefault();
    handler();
  };
  onMounted(() => {
    window.addEventListener(FOCUS_APP_SEARCH_EVENT, focusInput);
  });
  onUnmounted(() => {
    window.removeEventListener(FOCUS_APP_SEARCH_EVENT, focusInput);
    cancelWrite();
  });
</script>
