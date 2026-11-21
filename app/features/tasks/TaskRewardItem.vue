<template>
  <div
    class="inline-flex max-w-full min-w-0 items-center gap-1.5 @md:max-w-64"
    data-testid="task-reward-item"
    @contextmenu="openItemMenu"
  >
    <UPopover v-if="linkedItem" :open="open" :content="contentOptions" @update:open="setOpen">
      <button
        type="button"
        :aria-label="t('page.tasks.questcard.preview_reward', { reward: name })"
        class="text-surface-400 bg-surface-800/40 focus-visible:ring-primary-500 relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none pointer-coarse:size-9"
        @pointerenter="openOnHover"
        @pointerleave="scheduleHoverClose"
        @focus="openOnFocus"
        @blur="closeOnBlur"
        @click.capture="keepHoverOpen"
      >
        <UIcon name="i-mdi-image-outline" class="size-4" aria-hidden="true" />
        <img
          :key="iconSrc"
          :src="iconSrc"
          alt=""
          loading="lazy"
          class="bg-surface-900 absolute inset-0 size-full rounded-sm object-contain"
          @error="hideImage"
        />
      </button>
      <template #content>
        <div
          ref="panel"
          tabindex="-1"
          class="w-36 max-w-full p-2 text-xs outline-none"
          @focusin="activatePanel"
          @pointerenter="cancelHoverClose"
          @pointerleave="scheduleHoverClose"
          @contextmenu="openItemMenu"
        >
          <img
            :key="previewSrc"
            :src="previewSrc"
            alt=""
            class="bg-surface-900/90 mx-auto mb-2 block size-28 rounded-sm object-contain"
            @error="hideImage"
          />
          <p class="text-surface-100 font-semibold wrap-anywhere">{{ name }}</p>
          <p v-if="detail" class="text-surface-400 mt-1">{{ detail }}</p>
        </div>
      </template>
    </UPopover>
    <TaskItemLinks :item="linkedItem" :label="label" :tooltip-text="name" />
    <span v-if="staticDetail" class="text-surface-400 shrink-0">{{ staticDetail }}</span>
  </div>
</template>
<script setup lang="ts">
  import { useTaskCardPreview } from '@/features/tasks/composables/useTaskCardPreview';
  import TaskItemLinks from '@/features/tasks/TaskItemLinks.vue';
  import { getCurrencySymbol } from '@/utils/constants';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { getKeyIconSrc, getKeyPreviewSrc } from '@/utils/tarkovKeyHelpers';
  import type { TarkovItem } from '@/types/tarkov';
  const props = defineProps<{
    item?: TarkovItem;
    count?: number;
    offer?: { trader: { name: string }; level: number };
    shortLabel?: string;
  }>();
  const emit = defineEmits<{ itemContextMenu: [event: MouseEvent, item: TarkovItem] }>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const panel = useTemplateRef<HTMLElement>('panel');
  const {
    open,
    setOpen,
    openOnHover,
    openOnFocus,
    closeOnBlur,
    scheduleHoverClose,
    cancelHoverClose,
    onOpenAutoFocus,
    onCloseAutoFocus,
    activatePanel,
    keepHoverOpen,
  } = useTaskCardPreview(panel);
  const linkedItem = computed(() => (props.item?.id ? props.item : undefined));
  const name = computed(() => props.item?.name || props.item?.shortName || t('common.item'));
  const iconSrc = computed(() => (linkedItem.value ? getKeyIconSrc(linkedItem.value) : undefined));
  const previewSrc = computed(() =>
    linkedItem.value ? getKeyPreviewSrc(linkedItem.value) : undefined
  );
  const contentOptions = computed(() => ({
    'aria-label': name.value,
    side: 'top' as const,
    sideOffset: 6,
    onOpenAutoFocus,
    onCloseAutoFocus,
  }));
  const currency = computed(() => (props.offer ? null : getCurrencySymbol(props.item?.id ?? '')));
  const amount = computed(() => formatNumber(props.count ?? 1));
  const label = computed(() => {
    if (currency.value) {
      return t('page.tasks.questcard.reward_currency', {
        amount: amount.value,
        symbol: currency.value,
      });
    }
    const itemName = props.shortLabel || name.value;
    return props.offer
      ? itemName
      : t('page.tasks.questcard.reward_quantity', { name: itemName, amount: amount.value });
  });
  const detail = computed(() =>
    props.offer
      ? t('page.tasks.questcard.purchase_unlock_trader', {
          trader: props.offer.trader.name,
          level: props.offer.level,
        })
      : undefined
  );
  const staticDetail = computed(() => (linkedItem.value ? undefined : detail.value));
  function hideImage(event: Event) {
    (event.target as HTMLImageElement).hidden = true;
  }
  function openItemMenu(event: MouseEvent) {
    if (!linkedItem.value) return;
    event.preventDefault();
    event.stopPropagation();
    emit('itemContextMenu', event, linkedItem.value);
  }
</script>
