<template>
  <!-- Compact Card Layout - Works for ALL items -->
  <div
    class="group relative flex flex-col items-center rounded-lg border p-1.5 transition-all select-none hover:scale-105 sm:p-2"
    :class="[
      isComplete
        ? 'border-success-500/50 bg-success-900/20'
        : 'border-surface-700 bg-surface-800/80 hover:border-surface-600 hover:bg-surface-800',
    ]"
    @click="toggleComplete"
    @contextmenu.prevent="openContextMenu"
  >
    <!-- Item Image -->
    <div class="relative mb-1.5 h-14 w-14 shrink-0 sm:mb-2 sm:h-16 sm:w-16">
      <GameItem
        :item-id="requirement.item.id"
        :item-name="requirement.item.name"
        :dev-link="requirement.item.link"
        :wiki-link="requirement.item.wikiLink"
        :icon-link="requirement.item.iconLink"
        :image512px-link="requirement.item.image512pxLink"
        size="small"
        :show-actions="false"
        simple-mode
      />
      <!-- Complete Checkmark Overlay -->
      <div
        v-if="isComplete"
        class="bg-success-500/40 absolute inset-0 flex items-center justify-center rounded"
      >
        <UIcon name="i-mdi-check-circle" class="text-success-300 h-6 w-6 sm:h-8 sm:w-8" />
      </div>
      <!-- FiR Badge -->
      <AppTooltip v-if="showFoundInRaidBadge" :text="$t('common.found_in_raid_required')">
        <UIcon
          name="i-mdi-checkbox-marked-circle-outline"
          class="text-warning-400 absolute -top-1 -right-1 h-3 w-3"
        />
      </AppTooltip>
      <!-- Count Badge for multi-count items -->
      <div v-if="showPartialCount" class="absolute right-0 -bottom-1 left-0 flex justify-center">
        <div
          class="border-surface-700 bg-surface-900/90 rounded border px-1 py-0.5 text-[9px] font-bold sm:px-1.5 sm:text-[10px]"
          :class="isComplete ? 'text-success-400' : 'text-surface-300'"
        >
          {{ formatNumber(currentCount) }}/{{ formatNumber(requiredCount) }}
        </div>
      </div>
    </div>
    <!-- Item Name -->
    <div
      class="text-surface-200 w-full text-center leading-tight font-medium"
      :class="itemLabelClass"
    >
      {{ itemLabel }}
    </div>
  </div>
  <!-- Context Menu for Manual Count Adjustment -->
  <ContextMenu ref="contextMenu">
    <template #default="{ close }">
      <div class="border-surface-700 text-surface-400 border-b px-2 py-1 text-xs font-medium">
        {{ requirement.item.name }}
      </div>
      <ContextMenuItem
        v-if="!isComplete"
        icon="i-mdi-check-circle"
        :label="
          $t('page.hideout.stationcard.requirement.mark_complete', {
            count: formatNumber(requiredCount),
          })
        "
        @click="
          markComplete();
          close();
        "
      />
      <ContextMenuItem
        v-if="isComplete"
        icon="i-mdi-close-circle"
        :label="$t('page.hideout.stationcard.requirement.mark_incomplete')"
        @click="
          markIncomplete();
          close();
        "
      />
      <div v-if="showPartialCount" class="border-surface-700 my-1 border-t" />
      <template v-if="showPartialCount">
        <div class="space-y-2 px-3 py-2">
          <div class="text-surface-400 text-xs">
            {{ $t('page.hideout.stationcard.requirement.set_custom_amount') }}
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-mdi-minus"
              :disabled="currentCount === 0"
              @click.stop="decrementCount"
            />
            <input
              ref="inputRef"
              v-model.number="editValue"
              type="number"
              :min="0"
              :max="requirement.count"
              class="border-surface-600 focus:ring-primary-500/30 bg-surface-700 w-20 rounded border px-2 py-1 text-center text-sm font-bold focus:ring-1 focus:outline-none"
              :class="isComplete ? 'text-success-400' : 'text-surface-300'"
              @input="handleInput"
              @click.stop
            />
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-mdi-plus"
              :disabled="currentCount >= requirement.count"
              @click.stop="incrementCount"
            />
          </div>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            block
            @click="
              applyCustomCount();
              close();
            "
          >
            {{ $t('common.apply') }}
          </UButton>
        </div>
      </template>
      <div class="border-surface-700 my-1 border-t" />
      <ContextMenuItem
        v-if="requirement.item.link"
        icon="/img/logos/tarkovdevlogo.webp"
        :label="$t('common.view_on_tarkov_dev')"
        @click="
          openTarkovDev();
          close();
        "
      />
      <ContextMenuItem
        v-if="requirement.item.wikiLink"
        icon="/img/logos/wikilogo.webp"
        :label="$t('common.view_on_wiki')"
        @click="
          openWiki();
          close();
        "
      />
    </template>
  </ContextMenu>
</template>
<script setup lang="ts">
  import GameItem from '@/components/ui/GameItem.vue';
  import { useWikiLink } from '@/composables/useWikiLink';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getCurrencySymbol } from '@/utils/constants';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { openExternalUrl } from '@/utils/redirect';
  import type ContextMenuType from '@/components/ui/ContextMenu.vue';
  const ContextMenu = defineAsyncComponent(() => import('@/components/ui/ContextMenu.vue'));
  const ContextMenuItem = defineAsyncComponent(() => import('@/components/ui/ContextMenuItem.vue'));
  interface Props {
    requirement: {
      id: string;
      item: {
        id: string;
        name?: string;
        link?: string | null;
        wikiLink?: string | null;
        iconLink?: string;
        image512pxLink?: string;
      };
      count: number;
      attributes?: Array<{
        type: string;
        name: string;
        value: string;
      }>;
    };
    stationId: string;
    level: number;
  }
  const props = defineProps<Props>();
  const tarkovStore = useTarkovStore();
  const { toWikiUrl } = useWikiLink();
  const formatNumber = useLocaleNumberFormatter();
  const requirementId = computed(() => props.requirement.id);
  const requiredCount = computed(() => props.requirement.count);
  const currencySymbol = computed(() => getCurrencySymbol(props.requirement.item.id) ?? '');
  const isCurrency = computed(() => currencySymbol.value !== '');
  const showPartialCount = computed(() => !isCurrency.value && requiredCount.value > 1);
  const formattedCurrency = computed(
    () => `${currencySymbol.value}${formatNumber(requiredCount.value)}`
  );
  const itemLabel = computed(() =>
    isCurrency.value ? formattedCurrency.value : props.requirement.item.name
  );
  const itemLabelClass = computed(() =>
    isCurrency.value ? 'break-all text-[9px] sm:text-[10px]' : 'line-clamp-2 text-[11px] sm:text-xs'
  );
  // Context menu
  const contextMenu = ref<InstanceType<typeof ContextMenuType>>();
  const pendingContextEvent = ref<MouseEvent | null>(null);
  const editValue = ref(0);
  // Check if item requires Found in Raid status
  const isFoundInRaid = computed(() => {
    const firAttribute = props.requirement.attributes?.find(
      (attr) => attr.type === 'foundInRaid' || attr.name === 'foundInRaid'
    );
    return firAttribute?.value === 'true';
  });
  const showFoundInRaidBadge = computed(() => !isCurrency.value && isFoundInRaid.value);
  // Get current count from store (synced with needed items page)
  const currentCount = computed(() => {
    const storeCount = tarkovStore.getHideoutPartCount(requirementId.value);
    // If marked as complete but no count set, return required count
    if (storeCount === 0 && tarkovStore.isHideoutPartComplete(requirementId.value)) {
      return requiredCount.value;
    }
    return storeCount;
  });
  const isComplete = computed(() => currentCount.value >= requiredCount.value);
  // Watch current count to update edit value
  watch(
    currentCount,
    (newCount) => {
      editValue.value = newCount;
    },
    { immediate: true }
  );
  const clampCount = (value: number) => Math.max(0, Math.min(value, requiredCount.value));
  const setCount = (value: number): void => {
    const clampedValue = clampCount(value);
    tarkovStore.setHideoutPartCount(requirementId.value, clampedValue);
    if (clampedValue >= requiredCount.value) {
      tarkovStore.setHideoutPartComplete(requirementId.value);
    } else {
      tarkovStore.setHideoutPartUncomplete(requirementId.value);
    }
  };
  const incrementCount = (): void => {
    editValue.value = Math.min(editValue.value + 1, requiredCount.value);
  };
  const decrementCount = (): void => {
    editValue.value = Math.max(editValue.value - 1, 0);
  };
  const handleInput = (): void => {
    // Clamp the value as user types
    if (editValue.value > requiredCount.value) {
      editValue.value = requiredCount.value;
    } else if (editValue.value < 0) {
      editValue.value = 0;
    }
  };
  const applyCustomCount = (): void => {
    setCount(editValue.value);
  };
  // Simple toggle between 0% and 100% completion (click on card)
  const toggleComplete = (): void => {
    if (isComplete.value) {
      // Mark as incomplete (set to 0)
      setCount(0);
    } else {
      // Mark as complete (set to required count)
      setCount(requiredCount.value);
    }
  };
  const markComplete = (): void => {
    setCount(requiredCount.value);
  };
  const markIncomplete = (): void => {
    setCount(0);
  };
  const openContextMenu = (event: MouseEvent): void => {
    editValue.value = currentCount.value;
    event.stopPropagation();
    if (contextMenu.value) {
      contextMenu.value.open(event);
    } else {
      pendingContextEvent.value = event;
    }
  };
  watch(contextMenu, (menu) => {
    if (menu && pendingContextEvent.value) {
      menu.open(pendingContextEvent.value);
      pendingContextEvent.value = null;
    }
  });
  const openTarkovDev = (): void => {
    if (props.requirement.item.link) {
      openExternalUrl(props.requirement.item.link);
    }
  };
  const openWiki = (): void => {
    const url = toWikiUrl(props.requirement.item.wikiLink);
    if (url) {
      openExternalUrl(url);
    }
  };
</script>
