<template>
  <div
    class="group relative cursor-default"
    :class="[containerClasses, { 'h-full w-full': size !== 'small' }]"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Simple image display mode (for ItemImage compatibility) -->
    <div
      v-if="simpleMode"
      :class="[
        'relative overflow-hidden',
        imageContainerClasses,
        imageTileClasses,
        fill ? 'flex items-center justify-center p-2 sm:p-3' : '',
      ]"
    >
      <img
        v-if="isVisible && computedImageSrc"
        :src="computedImageSrc"
        :class="[
          fill ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-contain',
          imageElementClasses,
        ]"
        loading="lazy"
        @error="handleImgError"
      />
      <div
        v-else
        :class="[
          'bg-surface-800 flex h-full w-full items-center justify-center rounded',
          imageClasses,
        ]"
      >
        <UIcon name="i-mdi-loading" class="h-6 w-6 animate-spin text-gray-400" />
      </div>
    </div>
    <!-- Full item display mode (for TarkovItem compatibility) -->
    <div v-else class="relative flex h-full w-full items-center justify-start">
      <div class="mr-2 flex shrink-0 items-center justify-center">
        <img
          :width="imageSize"
          :height="imageSize"
          :src="computedImageSrc"
          :class="imageClasses"
          class="rounded"
          alt="Item Icon"
          @error="handleImgError"
        />
      </div>
      <!-- Counter controls for multi-item objectives -->
      <div v-if="showCounter" class="mr-2" @click.stop>
        <ItemCountControls
          :current-count="currentCount"
          :needed-count="neededCount"
          @decrease="emit('decrease')"
          @increase="emit('increase')"
          @toggle="emit('toggle')"
        />
      </div>
      <!-- Simple count display for single items -->
      <div v-else-if="props.count" class="mr-2 text-sm font-medium text-gray-300">
        {{ formatNumber(props.count) }}
      </div>
      <div
        v-if="props.itemName"
        class="flex items-center justify-center text-center text-sm leading-tight font-bold text-white"
      >
        {{ props.itemName }}
      </div>
      <!-- Hover action buttons - covers entire row -->
      <div
        v-if="showActions && (props.devLink || props.wikiLink)"
        class="absolute inset-0 flex items-center justify-center gap-2 rounded bg-black/80 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <AppTooltip v-if="props.devLink" text="View on tarkov.dev">
          <a
            :href="props.devLink"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center rounded p-1.5 text-gray-200 transition-colors hover:bg-white/20 hover:text-white"
            @click.stop
          >
            <img src="/img/logos/tarkovdevlogo.webp" alt="tarkov.dev" class="h-5 w-5" />
          </a>
        </AppTooltip>
        <AppTooltip v-if="props.wikiLink" text="View on Wiki">
          <a
            :href="props.wikiLink"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center rounded p-1.5 text-gray-200 transition-colors hover:bg-white/20 hover:text-white"
            @click.stop
          >
            <img src="/img/logos/wikilogo.webp" alt="Wiki" class="h-5 w-5" />
          </a>
        </AppTooltip>
        <AppTooltip v-if="props.itemName" text="Copy Name">
          <button
            type="button"
            class="inline-flex cursor-pointer items-center justify-center rounded p-1.5 text-gray-200 transition-colors hover:bg-white/20 hover:text-white"
            @click.stop="copyItemName"
          >
            <UIcon name="i-mdi-content-copy" class="h-5 w-5" />
          </button>
        </AppTooltip>
      </div>
    </div>
    <!-- Context Menu -->
    <ContextMenu ref="contextMenu">
      <template #default="{ close }">
        <!-- Task Options -->
        <template v-if="props.taskWikiLink">
          <ContextMenuItem
            icon="/img/logos/wikilogo.webp"
            :label="`View Task on Wiki`"
            @click="
              openTaskWiki();
              close();
            "
          />
          <div
            v-if="props.wikiLink || props.devLink || props.itemName"
            class="my-1 border-t border-gray-700"
          />
        </template>
        <!-- Item Options -->
        <ContextMenuItem
          v-if="props.itemName && props.wikiLink"
          icon="/img/logos/wikilogo.webp"
          :label="`View ${props.itemName} on Wiki`"
          @click="
            openWikiLink();
            close();
          "
        />
        <ContextMenuItem
          v-if="props.itemName && props.devLink"
          icon="/img/logos/tarkovdevlogo.webp"
          :label="`View ${props.itemName} on Tarkov.dev`"
          @click="
            openTarkovDevLink();
            close();
          "
        />
        <template v-if="!props.itemName">
          <ContextMenuItem
            v-if="props.wikiLink"
            icon="/img/logos/wikilogo.webp"
            label="View on Wiki"
            @click="
              openWikiLink();
              close();
            "
          />
          <ContextMenuItem
            v-if="props.devLink"
            icon="/img/logos/tarkovdevlogo.webp"
            label="View on Tarkov.dev"
            @click="
              openTarkovDevLink();
              close();
            "
          />
        </template>
        <div
          v-if="props.itemName && (props.wikiLink || props.devLink)"
          class="my-1 border-t border-gray-700"
        />
        <ContextMenuItem
          v-if="props.itemName"
          icon="i-mdi-content-copy"
          label="Copy Item Name"
          @click="
            copyItemName();
            close();
          "
        />
      </template>
    </ContextMenu>
  </div>
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent, ref } from 'vue';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { logger } from '@/utils/logger';
  import ContextMenu from './ContextMenu.vue';
  import ContextMenuItem from './ContextMenuItem.vue';
  const ItemCountControls = defineAsyncComponent(
    () => import('@/features/neededitems/ItemCountControls.vue')
  );
  interface Props {
    // Basic item identification
    itemId?: string;
    itemName?: string | null;
    // Image sources (multiple options for flexibility)
    src?: string;
    iconLink?: string;
    image512pxLink?: string;
    // External links
    devLink?: string | null;
    wikiLink?: string | null;
    // Task context (for showing task options in context menu)
    taskId?: string | null;
    taskName?: string | null;
    taskWikiLink?: string | null;
    // Display options
    count?: number | null;
    size?: 'xs' | 'small' | 'medium' | 'large';
    simpleMode?: boolean;
    showActions?: boolean;
    isVisible?: boolean;
    backgroundColor?: string;
    // Click handling
    clickable?: boolean;
    // Counter controls
    showCounter?: boolean;
    currentCount?: number;
    neededCount?: number;
    // Fill parent container (for simpleMode)
    fill?: boolean;
    // Legacy compatibility
    imageItem?: {
      iconLink?: string;
      image512pxLink?: string;
      backgroundColor?: string;
    };
    copyValue?: string | null;
  }
  const props = withDefaults(defineProps<Props>(), {
    itemId: '',
    itemName: null,
    src: '',
    iconLink: '',
    image512pxLink: '',
    devLink: null,
    wikiLink: null,
    taskId: null,
    taskName: null,
    taskWikiLink: null,
    count: null,
    size: 'medium',
    simpleMode: false,
    showActions: true,
    isVisible: true,
    backgroundColor: '',
    clickable: false,
    showCounter: false,
    currentCount: 0,
    neededCount: 1,
    fill: false,
    imageItem: undefined,
    copyValue: null,
  });
  const emit = defineEmits<{
    click: [event: MouseEvent];
    increase: [];
    decrease: [];
    toggle: [];
  }>();
  const formatNumber = useLocaleNumberFormatter();
  const backgroundClassMap = {
    violet: 'bg-brand-900',
    grey: 'bg-surface-900',
    yellow: 'bg-warning-900',
    orange: 'bg-warning-950',
    green: 'bg-success-950',
    red: 'bg-error-900',
    black: 'bg-surface-950',
    blue: 'bg-secondary-900',
    default: 'bg-transparent',
  } as const;
  type BackgroundKey = keyof typeof backgroundClassMap;
  const contextMenu = ref<InstanceType<typeof ContextMenu>>();
  // Compute image source based on available props
  const computedImageSrc = computed(() => {
    // Priority order: explicit src > iconLink > imageItem.iconLink > generated from itemId
    if (props.src) return props.src;
    if (props.iconLink) return props.iconLink;
    if (props.imageItem?.iconLink) return props.imageItem.iconLink;
    if (props.imageItem?.image512pxLink && props.size === 'large')
      return props.imageItem.image512pxLink;
    if (props.itemId) return `https://assets.tarkov.dev/${props.itemId}-icon.webp`;
    return '';
  });
  // Compute display properties based on size
  const imageSize = computed(() => {
    switch (props.size) {
      case 'xs':
        return 32;
      case 'small':
        return 64;
      case 'large':
        return 104;
      case 'medium':
      default:
        return 84;
    }
  });
  const containerClasses = computed(() => {
    if (props.simpleMode) {
      return 'block';
    }
    return '';
  });
  const imageContainerClasses = computed(() => {
    const classes = ['block', 'relative', 'overflow-hidden'];
    if (props.fill) {
      classes.push('h-full', 'w-full');
    } else {
      classes.push('shrink-0');
      if (props.size === 'xs') {
        classes.push('h-8 w-8'); // 32px - compact inline display
      } else if (props.size === 'small') {
        classes.push('h-12 w-12 md:h-16 md:w-16'); // 48px -> 64px
      } else if (props.size === 'large') {
        classes.push('h-20 w-20 md:h-28 md:w-28'); // 80px -> 112px
      } else {
        classes.push('h-16 w-16 md:h-24 md:w-24'); // 64px -> 96px
      }
    }
    return classes;
  });
  const imageClasses = computed(() => {
    const classes: string[] = ['rounded'];
    classes.push(resolvedBackgroundClass.value);
    return classes;
  });
  const resolvedBackgroundClass = computed(() => {
    const bgColor = (
      props.backgroundColor ||
      props.imageItem?.backgroundColor ||
      'default'
    ).toLowerCase() as BackgroundKey;
    const backgroundClass: string = backgroundClassMap[bgColor] ?? backgroundClassMap.default;
    // In `fill` mode, treat a transparent/default background as grey to preserve visible contrast when
    // the tile is expanded/filled. This is an intentional visual design decision to avoid invisible fills.
    if (backgroundClass === backgroundClassMap.default && props.fill) {
      return backgroundClassMap.grey;
    }
    return backgroundClass;
  });
  const imageTileClasses = computed(() => {
    const baseImageClasses = imageClasses.value;
    const backgroundClass = resolvedBackgroundClass.value;
    const classes: string[] = baseImageClasses.slice();
    if (backgroundClass !== backgroundClassMap.default) {
      classes.push('ring-1', 'ring-white/5', 'shadow-inner');
    }
    return classes;
  });
  const imageElementClasses = ['rounded'];
  // Image error handling
  const handleImgError = () => {
    // Log error for debugging if needed
    logger.warn(`[GameItem] Failed to load image for item: ${props.itemId || 'unknown'}`);
  };
  // Action methods
  const openTarkovDevLink = () => {
    if (props.devLink) {
      window.open(props.devLink, '_blank');
    }
  };
  const openWikiLink = () => {
    if (props.wikiLink) {
      window.open(props.wikiLink, '_blank');
    }
  };
  const copyItemName = () => {
    const textToCopy = props.copyValue || props.itemName;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
  };
  const handleClick = (event: MouseEvent) => {
    if (props.clickable) {
      emit('click', event);
    }
  };
  const handleContextMenu = (event: MouseEvent) => {
    // Only show context menu if there are links available
    if (props.devLink || props.wikiLink || props.itemName || props.taskWikiLink) {
      contextMenu.value?.open(event);
    }
  };
  const openTaskWiki = () => {
    if (props.taskWikiLink) {
      window.open(props.taskWikiLink, '_blank');
    }
  };
</script>
