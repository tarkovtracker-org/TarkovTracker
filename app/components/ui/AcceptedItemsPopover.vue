<template>
  <UPopover v-model:open="open" :content="{ align: 'center', side: 'top', sideOffset: 8 }">
    <button
      type="button"
      :class="[
        'focus-visible:ring-primary-500 inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2',
        triggerClass,
      ]"
      :aria-label="
        t('needed_items.view_accepted_items', { count }, 'View all {count} accepted items')
      "
    >
      <UIcon
        v-if="cycling"
        name="i-mdi-swap-horizontal"
        class="h-3 w-3 shrink-0"
        aria-hidden="true"
      />
      <UIcon v-else name="i-mdi-format-list-bulleted" class="h-3 w-3 shrink-0" aria-hidden="true" />
      {{ t('needed_items.any_of_items_short', { count }, 'Any {count}') }}
    </button>
    <template #content>
      <div class="w-[min(22rem,calc(100vw-1.5rem))] p-3">
        <div class="text-surface-50 mb-2 text-xs font-semibold">
          {{ t('needed_items.any_of_items', { count }, 'Any one of these {count} items counts') }}
        </div>
        <input
          v-if="count > PAGE_SIZE"
          v-model="search"
          type="search"
          :aria-label="t('needed_items.search_accepted_items')"
          :placeholder="t('needed_items.search_accepted_items')"
          class="border-surface-600 bg-surface-900 text-surface-100 focus-visible:ring-primary-500 mb-2 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2"
        />
        <ul ref="itemList" class="max-h-72 space-y-1 overflow-y-auto pr-1">
          <li v-for="entry in pageItems" :key="entry.id">
            <a
              :href="toWikiUrl(getKeyPrimaryUrl(entry))"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:bg-surface-800 focus-visible:ring-primary-500 group flex items-center gap-2 rounded-md p-1.5 transition-colors focus:outline-none focus-visible:ring-2"
            >
              <span
                class="bg-surface-900 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded ring-1 ring-white/10"
              >
                <NuxtImg
                  v-if="entry.iconLink"
                  :src="entry.iconLink"
                  :alt="entry.name ?? entry.shortName ?? ''"
                  width="36"
                  height="36"
                  sizes="36px"
                  loading="lazy"
                  class="h-full w-full object-contain"
                />
                <UIcon v-else name="i-mdi-help" class="text-surface-500 h-4 w-4" />
              </span>
              <span class="text-surface-100 min-w-0 flex-1 truncate text-xs font-medium">
                {{ entry.name ?? entry.shortName ?? '' }}
              </span>
              <UIcon
                name="i-mdi-open-in-new"
                class="text-surface-500 group-hover:text-surface-300 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
            </a>
          </li>
        </ul>
        <p v-if="!filteredItems.length" role="status" class="text-surface-400 py-3 text-sm">
          {{ t('needed_items.no_accepted_items') }}
        </p>
        <div v-if="count > PAGE_SIZE" class="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            :disabled="page === 1"
            :aria-label="t('common.previous')"
            class="text-surface-200 hover:bg-surface-800 focus-visible:ring-primary-500 rounded p-1.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
            @click="page--"
          >
            <UIcon name="i-mdi-chevron-left" class="h-4 w-4" />
          </button>
          <span role="status" class="text-surface-400 text-center text-xs">
            {{
              t('needed_items.accepted_items_page', {
                page,
                pages: pageCount,
                count: filteredItems.length,
              })
            }}
          </span>
          <button
            type="button"
            :disabled="page === pageCount"
            :aria-label="t('common.next')"
            class="text-surface-200 hover:bg-surface-800 focus-visible:ring-primary-500 rounded p-1.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
            @click="page++"
          >
            <UIcon name="i-mdi-chevron-right" class="h-4 w-4" />
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import { getKeyPrimaryUrl } from '@/utils/tarkovKeyHelpers';
  import type { TarkovItem } from '@/types/tarkov';
  const props = withDefaults(
    defineProps<{
      /** All accepted items for an "any of these" objective. */
      items: TarkovItem[];
      /** Whether the parent display is actively rotating (controls the badge icon). */
      cycling?: boolean;
      /** Classes applied to the badge trigger so it matches each placement. */
      triggerClass?: string;
    }>(),
    {
      cycling: false,
      triggerClass: '',
    }
  );
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const open = defineModel<boolean>('open', { default: false });
  const PAGE_SIZE = 50;
  const count = computed(() => props.items.length);
  const search = ref('');
  const page = ref(1);
  const itemList = ref<HTMLUListElement>();
  const filteredItems = computed(() => {
    const query = search.value.trim().toLocaleLowerCase();
    if (!query) return props.items;
    return props.items.filter((item) =>
      [item.name, item.shortName, item.id].some((value) =>
        value?.toLocaleLowerCase().includes(query)
      )
    );
  });
  const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)));
  const pageItems = computed(() =>
    filteredItems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
  );
  watch([open, () => props.items], () => {
    search.value = '';
    page.value = 1;
  });
  watch(search, () => {
    page.value = 1;
  });
  watch([page, search], () => {
    if (itemList.value) itemList.value.scrollTop = 0;
  });
</script>
