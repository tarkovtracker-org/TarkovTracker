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
      <NuxtImg
        v-if="isVisible && computedImageSrc"
        :src="computedImageSrc"
        :alt="props.itemName || 'Item'"
        :width="imageSize"
        :height="imageSize"
        :densities="fill ? 'x1 x2' : undefined"
        :sizes="fill ? undefined : `${imageSize}px`"
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
        <UIcon name="i-mdi-loading" class="text-surface-400 h-6 w-6 animate-spin" />
      </div>
    </div>
    <!-- Full item display mode (for TarkovItem compatibility) -->
    <div v-else class="relative flex h-full w-full items-center justify-start">
      <div class="mr-2 flex shrink-0 items-center justify-center">
        <NuxtImg
          :width="imageSize"
          :height="imageSize"
          :src="computedImageSrc"
          :alt="props.itemName || 'Item'"
          :sizes="`${imageSize}px`"
          :class="imageClasses"
          class="rounded"
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
      <div v-else-if="props.count" class="text-surface-300 mr-2 text-sm font-medium">
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
        class="absolute inset-0 flex items-center justify-center gap-2 rounded bg-black/80 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <AppTooltip v-if="props.devLink" :text="t('page.tasks.questcard.view_on_tarkov_dev')">
          <a
            :href="props.devLink"
            target="_blank"
            rel="noopener noreferrer"
            class="text-surface-200 inline-flex items-center justify-center rounded p-1.5 transition-colors hover:bg-white/20 hover:text-white"
            @click.stop
          >
            <NuxtImg
              src="/img/logos/tarkovdevlogo.webp"
              alt="tarkov.dev"
              width="20"
              height="20"
              sizes="20px"
              class="h-5 w-5"
            />
          </a>
        </AppTooltip>
        <AppTooltip v-if="props.wikiLink" :text="t('page.tasks.questcard.view_on_wiki')">
          <a
            :href="props.wikiLink"
            target="_blank"
            rel="noopener noreferrer"
            class="text-surface-200 inline-flex items-center justify-center rounded p-1.5 transition-colors hover:bg-white/20 hover:text-white"
            @click.stop
          >
            <NuxtImg
              src="/img/logos/wikilogo.webp"
              alt="Wiki"
              width="20"
              height="20"
              sizes="20px"
              class="h-5 w-5"
            />
          </a>
        </AppTooltip>
        <AppTooltip
          v-if="props.itemName"
          :text="t('page.tasks.questcard.copy_item_name', 'Copy Item Name')"
        >
          <button
            type="button"
            class="text-surface-200 inline-flex cursor-pointer items-center justify-center rounded p-1.5 transition-colors hover:bg-white/20 hover:text-white"
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
            :label="t('page.tasks.questcard.view_on_wiki')"
            @click="
              openTaskWiki();
              close();
            "
          />
          <div
            v-if="props.wikiLink || props.devLink || props.itemName"
            class="border-surface-700 my-1 border-t"
          />
        </template>
        <!-- Item Options -->
        <ContextMenuItem
          v-if="props.itemName && props.wikiLink"
          icon="/img/logos/wikilogo.webp"
          :label="t('page.tasks.questcard.view_on_wiki')"
          @click="
            openWikiLink();
            close();
          "
        />
        <ContextMenuItem
          v-if="props.itemName && props.devLink"
          icon="/img/logos/tarkovdevlogo.webp"
          :label="t('page.tasks.questcard.view_on_tarkov_dev')"
          @click="
            openTarkovDevLink();
            close();
          "
        />
        <template v-if="!props.itemName">
          <ContextMenuItem
            v-if="props.wikiLink"
            icon="/img/logos/wikilogo.webp"
            :label="t('page.tasks.questcard.view_on_wiki')"
            @click="
              openWikiLink();
              close();
            "
          />
          <ContextMenuItem
            v-if="props.devLink"
            icon="/img/logos/tarkovdevlogo.webp"
            :label="t('page.tasks.questcard.view_on_tarkov_dev')"
            @click="
              openTarkovDevLink();
              close();
            "
          />
        </template>
        <div
          v-if="props.itemName && (props.wikiLink || props.devLink)"
          class="border-surface-700 my-1 border-t"
        />
        <ContextMenuItem
          v-if="props.itemName"
          icon="i-mdi-content-copy"
          :label="t('page.tasks.questcard.copy_item_name', 'Copy Item Name')"
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
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { logger } from '@/utils/logger';
  import type ContextMenu from '@/components/ui/ContextMenu.vue';
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
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const formatNumber = useLocaleNumberFormatter();
  const BACKGROUND_CLASS_MAP = {
    violet: 'bg-rarity-violet',
    grey: 'bg-rarity-grey',
    yellow: 'bg-rarity-yellow',
    orange: 'bg-rarity-orange',
    green: 'bg-rarity-green',
    red: 'bg-rarity-red',
    black: 'bg-rarity-black',
    blue: 'bg-rarity-blue',
    default: 'bg-rarity-default',
  } as const;
  type BackgroundKey = keyof typeof BACKGROUND_CLASS_MAP;
  const contextMenu = ref<InstanceType<typeof ContextMenu>>();
  // Compute image source based on available props
  const computedImageSrc = computed(() => {
    if (props.src) return props.src;
    if (props.iconLink) return props.iconLink;
    if (props.imageItem?.iconLink) return props.imageItem.iconLink;
    if (props.image512pxLink) return props.image512pxLink;
    if (props.imageItem?.image512pxLink) return props.imageItem.image512pxLink;
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
    const backgroundClass: string = BACKGROUND_CLASS_MAP[bgColor] ?? BACKGROUND_CLASS_MAP.default;
    // In `fill` mode, treat a transparent/default background as grey to preserve visible contrast when
    // the tile is expanded/filled. This is an intentional visual design decision to avoid invisible fills.
    if (backgroundClass === BACKGROUND_CLASS_MAP.default && props.fill) {
      return BACKGROUND_CLASS_MAP.grey;
    }
    return backgroundClass;
  });
  const imageTileClasses = computed(() => {
    const baseImageClasses = imageClasses.value;
    const backgroundClass = resolvedBackgroundClass.value;
    const classes: string[] = baseImageClasses.slice();
    if (backgroundClass !== BACKGROUND_CLASS_MAP.default) {
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
      window.open(props.devLink, '_blank', 'noopener,noreferrer');
    }
  };
  const openWikiLink = () => {
    if (props.wikiLink) {
      window.open(props.wikiLink, '_blank', 'noopener,noreferrer');
    }
  };
  const copyItemName = async () => {
    const textToCopy = props.copyValue || props.itemName;
    if (textToCopy) {
      await copyToClipboard(textToCopy);
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
      window.open(props.taskWikiLink, '_blank', 'noopener,noreferrer');
    }
  };
</script>
