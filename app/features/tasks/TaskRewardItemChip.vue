<template>
  <UPopover v-if="item?.id" :open="open" :content="contentOptions" @update:open="setOpen">
    <button
      type="button"
      :class="chipClass"
      :aria-label="t('page.tasks.questcard.preview_reward', { reward: label })"
      class="focus-visible:ring-primary-500 cursor-pointer text-start hover:brightness-125 focus-visible:ring-2 focus-visible:outline-none"
      data-testid="task-reward-item"
      @pointerenter="openOnHover"
      @pointerleave="scheduleHoverClose"
      @focus="openOnFocus"
      @blur="closeOnBlur"
      @click.capture="keepHoverOpen"
      @contextmenu.prevent.stop="emit('itemContextMenu', $event, item)"
    >
      <UIcon v-if="!grouped" :name="icon" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 wrap-anywhere">{{ label }}</span>
      <UIcon name="i-mdi-image-outline" class="size-3 shrink-0 opacity-80" aria-hidden="true" />
    </button>
    <template #content>
      <div
        ref="panel"
        class="w-52 max-w-full p-2.5 text-xs"
        @focusin="activatePanel"
        @pointerenter="cancelHoverClose"
        @pointerleave="scheduleHoverClose"
      >
        <img
          :key="previewSrc"
          :src="previewSrc"
          alt=""
          class="bg-surface-900/30 mb-2 block h-28 w-full rounded-sm object-contain"
          @error="hideImage"
        />
        <p class="text-surface-100 mb-1 font-semibold">{{ name }}</p>
        <p v-if="detail" class="text-surface-400 mb-1">{{ detail }}</p>
        <a
          :href="buildItemPageUrl(item.id)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:text-link-hover inline-flex items-center gap-1 underline underline-offset-2"
          @contextmenu.prevent.stop="emit('itemContextMenu', $event, item)"
        >
          {{ t('common.view_on_tarkov_dev') }}
          <UIcon name="i-mdi-open-in-new" class="size-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
    </template>
  </UPopover>
  <span v-else :class="chipClass">
    <UIcon v-if="!grouped" :name="icon" class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="min-w-0 wrap-anywhere">
      {{ label }}
      <span v-if="detail" class="text-surface-400">· {{ detail }}</span>
    </span>
  </span>
</template>
<script setup lang="ts">
  import { useTaskCardPreview } from '@/features/tasks/composables/useTaskCardPreview';
  import { getCurrencySymbol } from '@/utils/constants';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { getKeyPreviewSrc } from '@/utils/tarkovKeyHelpers';
  import { buildItemPageUrl } from '@/utils/tarkovUrls';
  import type { TarkovItem } from '@/types/tarkov';
  const props = defineProps<{
    item?: TarkovItem;
    count?: number;
    offer?: { trader: { name: string }; level: number };
    grouped?: boolean;
    groupedName?: string;
  }>();
  const emit = defineEmits<{
    itemContextMenu: [event: MouseEvent, item: TarkovItem];
  }>();
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
  const name = computed(() => props.item?.name || props.item?.shortName || t('common.item'));
  const previewSrc = computed(() => (props.item ? getKeyPreviewSrc(props.item) : undefined));
  const contentOptions = computed(() => ({
    'aria-label': name.value,
    side: 'top' as const,
    sideOffset: 6,
    onOpenAutoFocus,
    onCloseAutoFocus,
  }));
  const currency = computed(() => getCurrencySymbol(props.item?.id ?? ''));
  const amount = computed(() => formatNumber(props.count ?? 1));
  function itemLabel(itemName: string) {
    return currency.value
      ? t('page.tasks.questcard.reward_currency', { amount: amount.value, symbol: currency.value })
      : t('page.tasks.questcard.reward_quantity', { name: itemName, amount: amount.value });
  }
  const fullLabel = computed(() =>
    props.offer
      ? t('page.tasks.questcard.purchase_unlock_reward', { name: name.value })
      : itemLabel(name.value)
  );
  function groupedLabel() {
    const itemName = props.groupedName || name.value;
    return props.offer ? itemName : itemLabel(itemName);
  }
  const label = computed(() => (props.grouped ? groupedLabel() : fullLabel.value));
  const detail = computed(() =>
    props.offer
      ? t('page.tasks.questcard.purchase_unlock_trader', {
          trader: props.offer.trader.name,
          level: props.offer.level,
        })
      : undefined
  );
  const icon = computed(() => (props.offer ? 'i-mdi-cart-check' : 'i-mdi-package-variant'));
  const chipClass = computed(() => [
    'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 leading-snug font-medium pointer-coarse:min-h-9',
    props.grouped && '@md:max-w-64',
    props.offer
      ? 'bg-info-900 text-info-300 light:bg-info-100 light:text-info-900'
      : 'bg-success-900 text-success-300 light:bg-success-100 light:text-success-900',
  ]);
  function hideImage(event: Event) {
    (event.target as HTMLImageElement).hidden = true;
  }
</script>
