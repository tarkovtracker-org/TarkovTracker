<template>
  <div class="flex items-start gap-2.5">
    <ObjectiveTraderAvatar :name="traderName" :image="traderImage" :large="!compact" />
    <div class="min-w-0 flex-1">
      <component
        :is="wikiUrl ? 'a' : 'div'"
        v-bind="titleLinkProps"
        data-testid="objective-task-title"
        :class="titleClass"
        @click.stop
      >
        {{ taskName }}
        <UIcon
          v-if="wikiUrl"
          name="i-mdi-open-in-new"
          class="ml-0.5 inline-block h-3.5 w-3.5 align-middle"
          aria-hidden="true"
        />
      </component>
      <div class="text-surface-400 mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
        <span v-if="traderName" data-testid="objective-trader-name" class="truncate">
          {{ traderName }}
        </span>
        <span v-if="levelLabel" class="shrink-0">· {{ levelLabel }}</span>
        <a
          v-if="tarkovDevUrl"
          :href="tarkovDevUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="focus-visible:ring-primary-500 ml-auto inline-flex shrink-0 items-center justify-center rounded p-0.5 opacity-80 transition-colors hover:bg-white/10 hover:opacity-100 focus:outline-none focus-visible:ring-2"
          :title="translate('common.view_on_tarkov_dev')"
          :aria-label="translate('common.view_on_tarkov_dev')"
          @click.stop
        >
          <img
            src="/img/logos/tarkovdevlogo.webp"
            alt=""
            aria-hidden="true"
            width="14"
            height="14"
            class="size-3.5"
          />
        </a>
      </div>
    </div>
    <button
      type="button"
      data-testid="objective-close-button"
      class="text-surface-400 hover:text-surface-100 focus-visible:ring-primary-500 -mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-white/10 focus:outline-none focus-visible:ring-2"
      :aria-label="translate('common.close')"
      @click.stop="emit('close')"
    >
      <UIcon name="i-mdi-close" class="h-4 w-4" />
    </button>
  </div>
</template>
<script setup lang="ts">
  import ObjectiveTraderAvatar from '@/features/maps/ObjectiveTraderAvatar.vue';
  // Rendered inside the Leaflet popup's standalone app, so translation arrives as a prop.
  const props = defineProps<{
    taskName: string;
    wikiUrl: string;
    tarkovDevUrl: string;
    traderName: string;
    traderImage: string;
    levelLabel: string;
    compact: boolean;
    translate: (key: string) => string;
  }>();
  const emit = defineEmits<{ close: [] }>();
  /** The full task name wraps instead of truncating; it links to the wiki only when trusted. */
  const titleLinkProps = computed(() =>
    props.wikiUrl
      ? {
          href: props.wikiUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: props.translate('common.view_on_wiki'),
        }
      : {}
  );
  const titleClass = computed(() => [
    'block break-words font-semibold leading-snug',
    props.compact ? 'text-[13px]' : 'text-sm',
    props.wikiUrl
      ? 'text-link hover:text-link-hover no-underline hover:underline'
      : 'text-surface-50',
  ]);
</script>
