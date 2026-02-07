<template>
  <div class="flex h-full flex-col rounded" :class="itemCardClasses">
    <!-- Item image - fixed aspect ratio -->
    <div class="relative aspect-video w-full shrink-0 overflow-hidden">
      <GameItem
        v-if="imageItem"
        :image-item="imageItem"
        :src="imageItem.image512pxLink"
        :is-visible="true"
        :background-color="imageItem?.backgroundColor || 'grey'"
        size="small"
        simple-mode
        fill
        class="h-full w-full"
      />
    </div>
    <!-- Item name - fixed height with line clamp -->
    <div v-if="item" class="flex h-12 shrink-0 items-center justify-center px-2 pt-2">
      <div class="line-clamp-2 text-center text-sm leading-tight">
        {{ item.name }}
        <AppTooltip v-if="props.need.foundInRaid" :text="$t('needed_items.fir_required')">
          <UIcon
            name="i-mdi-checkbox-marked-circle-outline"
            class="ml-0.5 inline-block h-3.5 w-3.5"
          />
        </AppTooltip>
        <AppTooltip v-if="isKappaRequired" :text="$t('needed_items.task_kappa_req')">
          <UIcon name="i-mdi-trophy" class="text-kappa ml-0.5 inline-block h-3.5 w-3.5" />
        </AppTooltip>
        <AppTooltip
          v-if="isLightkeeperRequired"
          :text="$t('page.tasks.questcard.lightkeeper_tooltip')"
        >
          <UIcon name="i-mdi-lighthouse" class="text-lightkeeper ml-0.5 inline-block h-3.5 w-3.5" />
        </AppTooltip>
        <AppTooltip v-if="isCraftable" :text="craftableTitle">
          <button
            type="button"
            class="ml-0.5 inline-flex"
            :aria-label="craftableTitle"
            @click.stop="goToCraftStation"
          >
            <UIcon
              name="i-mdi-hammer-wrench"
              class="h-3.5 w-3.5 opacity-90"
              :class="craftableIconClass"
              aria-hidden="true"
            />
          </button>
        </AppTooltip>
      </div>
    </div>
    <!-- Task/Station info - fixed height with line clamp -->
    <div class="flex h-10 shrink-0 items-center justify-center px-2">
      <template v-if="props.need.needType == 'taskObjective'">
        <div class="line-clamp-2 text-center">
          <task-link v-if="relatedTask" :task="relatedTask" />
          <span v-else class="text-surface-300 text-sm">
            {{ $t('needed_items.unknown_task') }}
          </span>
        </div>
      </template>
      <template v-else-if="props.need.needType == 'hideoutModule'">
        <div class="flex items-center justify-center text-center">
          <station-link
            v-if="relatedStation"
            :station="relatedStation"
            :module-id="props.need.hideoutModule.id"
            class="justify-center"
          />
          <span v-else class="text-surface-300 text-sm">
            {{ $t('needed_items.unknown_station') }}
          </span>
          <span class="ml-1 text-sm">{{ props.need.hideoutModule.level }}</span>
        </div>
      </template>
    </div>
    <!-- Requirements info - fixed height -->
    <div class="flex h-6 shrink-0 items-center justify-center px-2 text-xs">
      <RequirementInfo
        :need-type="props.need.needType"
        :level-required="levelRequired"
        :locked-before="lockedBefore"
        :player-level="tarkovStore.playerLevel()"
      />
    </div>
    <!-- Item count actions - pushed to bottom -->
    <div class="mt-auto flex flex-col items-center justify-center px-2 pt-1 pb-2">
      <template v-if="!selfCompletedNeed">
        <ItemCountControls
          :current-count="currentCount"
          :needed-count="neededCount"
          @decrease="$emit('decreaseCount')"
          @increase="$emit('increaseCount')"
          @toggle="$emit('toggleCount')"
          @set-count="(count) => $emit('setCount', count)"
        />
        <TeamNeedsDisplay
          v-if="teamNeeds.length > 0"
          :team-needs="teamNeeds"
          :needed-count="neededCount"
          class="mt-2"
        />
      </template>
      <span v-else class="text-success-400 text-sm font-semibold">
        {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import {
    createDefaultNeededItemContext,
    neededItemKey,
  } from '@/features/neededitems/neededitem-keys';
  import RequirementInfo from '@/features/neededitems/RequirementInfo.vue';
  import TeamNeedsDisplay from '@/features/neededitems/TeamNeedsDisplay.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { Need } from '@/types/tarkov';
  const TaskLink = defineAsyncComponent(() => import('@/features/tasks/TaskLink.vue'));
  const StationLink = defineAsyncComponent(() => import('@/features/hideout/StationLink.vue'));
  const props = defineProps<{
    need: Need;
  }>();
  defineEmits(['increaseCount', 'decreaseCount', 'toggleCount', 'setCount']);
  const tarkovStore = useTarkovStore();
  const formatNumber = useLocaleNumberFormatter();
  const {
    selfCompletedNeed,
    relatedTask,
    relatedStation,
    craftableIconClass,
    craftableTitle,
    goToCraftStation,
    lockedBefore,
    neededCount,
    currentCount,
    isCraftable,
    isKappaRequired,
    isLightkeeperRequired,
    levelRequired,
    item,
    teamNeeds,
    imageItem,
  } = inject(neededItemKey, createDefaultNeededItemContext());
  const itemCardClasses = computed(() => {
    return {
      'bg-gradient-to-t from-complete to-surface':
        selfCompletedNeed.value || currentCount.value >= neededCount.value,
      'bg-surface-800': !(selfCompletedNeed.value || currentCount.value >= neededCount.value),
      'shadow-md': true,
    };
  });
</script>
