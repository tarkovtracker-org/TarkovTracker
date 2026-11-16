<template>
  <div class="relative shrink-0 overflow-hidden rounded-md">
    <GameItem
      v-if="source"
      :image-item="imageItem ?? undefined"
      :src="source"
      :item-id="item?.id"
      :item-name="item?.name ?? null"
      :wiki-link="item?.wikiLink ?? null"
      :dev-link="item?.link ?? null"
      :task-wiki-link="taskWikiLink ?? null"
      :background-color="imageItem?.backgroundColor || 'grey'"
      size="small"
      simple-mode
      :fill="fill"
      :class="fill ? 'h-full w-full' : ''"
    />
    <div
      v-else
      class="bg-surface-700 animate-pulse"
      :class="fill ? 'h-full w-full' : 'size-12 md:size-16'"
      aria-hidden="true"
    />
    <span
      v-if="complete"
      class="bg-success-600 ring-surface-900 absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full ring-2"
      aria-hidden="true"
    >
      <UIcon name="i-mdi-check" class="size-3.5 text-white" />
    </span>
  </div>
</template>
<script setup lang="ts">
  import type { NeededItemImageItem } from '@/features/neededitems/neededitem-keys';
  import type { TarkovItem } from '@/types/tarkov';
  /** The item picture in its in-game rarity colour; the same component in rows and tiles. */
  const props = withDefaults(
    defineProps<{
      imageItem: NeededItemImageItem;
      item: Pick<TarkovItem, 'id' | 'name' | 'wikiLink' | 'link'> | null;
      taskWikiLink?: string | null;
      complete?: boolean;
      /** Large tiles use the 512px render; rows use the small icon. */
      fill?: boolean;
    }>(),
    { taskWikiLink: null, complete: false, fill: false }
  );
  const source = computed(() =>
    props.fill
      ? props.imageItem?.image512pxLink || props.imageItem?.iconLink
      : props.imageItem?.iconLink || props.imageItem?.image512pxLink
  );
</script>
