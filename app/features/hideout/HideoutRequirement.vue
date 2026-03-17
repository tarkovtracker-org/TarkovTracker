<template>
  <!-- Compact Card Layout - Works for ALL items -->
  <div
    class="group relative flex flex-col items-center rounded-lg border p-2 transition-all select-none hover:scale-105"
    :class="[
      isComplete
        ? 'border-success-500/50 bg-success-500/10'
        : 'border-border bg-panel hover:border-border-strong hover:bg-raised',
    ]"
    @click="toggleComplete"
    @contextmenu.prevent="openContextMenu"
  >
    <!-- Item Image -->
    <div class="relative mb-2 h-16 w-16 shrink-0">
      <GameItem
        :item-id="requirement.item.id"
        :item-name="requirement.item.name"
        :dev-link="requirement.item.link"
        :wiki-link="requirement.item.wikiLink"
        size="small"
        :show-actions="false"
        simple-mode
      />
      <!-- Complete Checkmark Overlay -->
      <div
        v-if="isComplete"
        class="bg-success-500/40 absolute inset-0 flex items-center justify-center rounded"
      >
        <UIcon name="i-mdi-check-circle" class="text-success-300 h-8 w-8" />
      </div>
      <!-- FiR Badge -->
      <AppTooltip
        v-if="isFoundInRaid"
        :text="$t('page.hideout.stationcard.requirement.found_in_raid')"
      >
        <UIcon
          name="i-mdi-checkbox-marked-circle-outline"
          class="text-warning-400 absolute -top-1 -right-1 h-3 w-3"
        />
      </AppTooltip>
      <!-- Count Badge for multi-count items -->
      <div v-if="requiredCount > 1" class="absolute right-0 -bottom-1 left-0 flex justify-center">
        <div
          class="bg-field border-border rounded border px-1.5 py-0.5 text-[10px] font-bold"
          :class="isComplete ? 'text-success-600' : 'text-foreground-muted'"
        >
          {{ formatNumber(currentCount) }}/{{ formatNumber(requiredCount) }}
        </div>
      </div>
    </div>
    <!-- Item Name -->
    <div class="text-foreground line-clamp-2 w-full text-center text-xs leading-tight font-medium">
      {{ requirement.item.name }}
    </div>
  </div>
  <!-- Context Menu for Manual Count Adjustment -->
  <ContextMenu ref="contextMenu">
    <template #default="{ close }">
      <div class="border-border text-foreground-subtle border-b px-2 py-1 text-xs font-medium">
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
      <div v-if="requiredCount > 1" class="border-border my-1 border-t" />
      <template v-if="requiredCount > 1">
        <div class="space-y-2 px-3 py-2">
          <div class="text-foreground-subtle text-xs">
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
              class="bg-field border-border focus:ring-primary-500/30 w-20 rounded border px-2 py-1 text-center text-sm font-bold focus:ring-1 focus:outline-none"
              :class="isComplete ? 'text-success-600' : 'text-foreground-muted'"
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
            {{ $t('page.hideout.stationcard.requirement.apply') }}
          </UButton>
        </div>
      </template>
      <div class="border-border my-1 border-t" />
      <ContextMenuItem
        v-if="requirement.item.link"
        icon="/img/logos/tarkovdevlogo.webp"
        :label="$t('page.hideout.stationcard.requirement.view_tarkov_dev')"
        @click="
          openTarkovDev();
          close();
        "
      />
      <ContextMenuItem
        v-if="requirement.item.wikiLink"
        icon="/img/logos/wikilogo.webp"
        :label="$t('page.hideout.stationcard.requirement.view_wiki')"
        @click="
          openWiki();
          close();
        "
      />
    </template>
  </ContextMenu>
</template>
<script setup lang="ts">
  import ContextMenu from '@/components/ui/ContextMenu.vue';
  import ContextMenuItem from '@/components/ui/ContextMenuItem.vue';
  import GameItem from '@/components/ui/GameItem.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  interface Props {
    requirement: {
      id: string;
      item: {
        id: string;
        name?: string;
        link?: string | null;
        wikiLink?: string | null;
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
  const formatNumber = useLocaleNumberFormatter();
  const requirementId = computed(() => props.requirement.id);
  const requiredCount = computed(() => props.requirement.count);
  // Context menu
  const contextMenu = ref<InstanceType<typeof ContextMenu>>();
  const editValue = ref(0);
  // Check if item requires Found in Raid status
  const isFoundInRaid = computed(() => {
    const firAttribute = props.requirement.attributes?.find(
      (attr) => attr.type === 'foundInRaid' || attr.name === 'foundInRaid'
    );
    return firAttribute?.value === 'true';
  });
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
    contextMenu.value?.open(event);
  };
  const openTarkovDev = (): void => {
    if (props.requirement.item.link) {
      window.open(props.requirement.item.link, '_blank');
    }
  };
  const openWiki = (): void => {
    if (props.requirement.item.wikiLink) {
      window.open(props.requirement.item.wikiLink, '_blank');
    }
  };
</script>
