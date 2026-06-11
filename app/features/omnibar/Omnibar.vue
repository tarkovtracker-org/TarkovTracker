<template>
  <UModal
    v-model:open="isOpen"
    class="z-[9999]"
    :title="t('omnibar.title', 'Search')"
    :description="t('omnibar.description', 'Search tasks, needed items, and hideout stations')"
    :ui="{
      overlay: 'bg-black/70 backdrop-blur-sm',
      content:
        'fixed inset-auto left-1/2 top-[10vh] -translate-x-1/2 translate-y-0 z-[9999] flex flex-col items-stretch justify-start w-[calc(100vw-2rem)] max-w-xl max-h-[70vh] p-0 overflow-hidden pointer-events-auto bg-surface-900 border border-surface-700/80 rounded-2xl shadow-2xl ring-0 divide-y-0',
    }"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="searchQuery"
        :groups="groups"
        :placeholder="t('omnibar.placeholder', 'Search tasks, needed items, hideout...')"
        :icon="'i-heroicons-magnifying-glass'"
        :close="true"
        close-icon="i-heroicons-x-mark"
        :aria-label="t('omnibar.aria_label', 'Global search')"
        class="h-[26rem] max-h-[70vh] w-full"
        :ui="{
          root: 'divide-surface-700/80',
          input: 'w-full',
          content: 'flex-1 min-h-0 flex flex-col',
          viewport: 'scroll-py-1',
          group: 'p-1.5',
          label: 'text-surface-450 px-2 py-1 text-[10px] font-semibold tracking-wider uppercase',
          item: 'text-surface-200 data-highlighted:bg-primary-500/10 data-highlighted:text-primary-300 gap-2 rounded-lg px-3 py-2 text-xs',
          itemLeadingIcon: 'text-surface-450 size-4 group-data-highlighted:text-primary-300',
          itemLabelBase: 'text-surface-100 [&>mark]:text-primary-300 [&>mark]:bg-primary-500/20',
          itemLabelSuffix: 'text-surface-450 text-[10px]',
          empty:
            'text-surface-450 flex flex-col items-center justify-center h-full py-10 text-center text-xs',
        }"
        @update:model-value="onSelect"
        @update:open="(value: boolean) => (isOpen = value)"
      >
        <template #empty>
          <span v-if="searchQuery.trim().length < 2">
            {{ t('omnibar.hint_min_chars', 'Type at least 2 characters to search...') }}
          </span>
          <span v-else>
            {{ t('omnibar.no_results', { query: searchQuery }) }}
          </span>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { useOmnibarSearch } from '@/features/omnibar/useOmnibarSearch';
  import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui';
  interface OmnibarRoute {
    path: string;
    query: Record<string, string>;
  }
  const { t } = useI18n();
  const isOpen = defineModel<boolean>('open', { default: false });
  const router = useRouter();
  const { searchQuery, results, currentContext } = useOmnibarSearch();
  watch(isOpen, (open) => {
    if (!open) {
      searchQuery.value = '';
    }
  });
  const taskGroup = computed<CommandPaletteGroup>(() => ({
    id: 'tasks',
    label: t('omnibar.group_tasks', 'Tasks / Quests'),
    ignoreFilter: true,
    items: results.value.tasks.map((task) => ({
      id: task.id,
      label: task.name || '',
      suffix: task.map?.name || '',
      icon: 'i-mdi-clipboard-text-outline',
      route: { path: '/tasks', query: { task: task.id } } as OmnibarRoute,
    })),
  }));
  const itemGroup = computed<CommandPaletteGroup>(() => ({
    id: 'items',
    label: t('omnibar.group_items', 'Needed Items'),
    ignoreFilter: true,
    items: results.value.items.map((item) => ({
      id: item.id,
      label: item.name || '',
      suffix: item.shortName || '',
      icon: 'i-mdi-package-variant-closed',
      route: { path: '/needed-items', query: { q: item.name || '' } } as OmnibarRoute,
    })),
  }));
  const hideoutGroup = computed<CommandPaletteGroup>(() => ({
    id: 'hideout',
    label: t('omnibar.group_hideout', 'Hideout Stations'),
    ignoreFilter: true,
    items: results.value.hideout.map((station) => ({
      id: station.id,
      label: station.name || '',
      icon: 'i-mdi-home-outline',
      route: { path: '/hideout', query: { station: station.id } } as OmnibarRoute,
    })),
  }));
  const groups = computed<CommandPaletteGroup[]>(() => {
    const orderedByContext: Partial<
      Record<'tasks' | 'hideout' | 'items' | 'global', CommandPaletteGroup[]>
    > = {
      items: [itemGroup.value, taskGroup.value, hideoutGroup.value],
      hideout: [hideoutGroup.value, taskGroup.value, itemGroup.value],
    };
    const ordered = orderedByContext[currentContext.value] ?? [
      taskGroup.value,
      itemGroup.value,
      hideoutGroup.value,
    ];
    return ordered.filter((group) => group.items && group.items.length > 0);
  });
  const onSelect = (item: CommandPaletteItem | undefined) => {
    const route = item?.route as OmnibarRoute | undefined;
    if (!route) return;
    isOpen.value = false;
    void router.push(route);
  };
</script>
