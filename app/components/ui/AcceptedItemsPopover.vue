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
        <ul class="max-h-72 space-y-1 overflow-y-auto pr-1">
          <li v-for="entry in items" :key="entry.id">
            <a
              :href="getKeyPrimaryUrl(entry)"
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
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
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
  const open = defineModel<boolean>('open', { default: false });
  const count = computed(() => props.items.length);
</script>
