<template>
  <div
    ref="cardRef"
    class="mb-1.5 rounded-md border-l-2 transition-colors"
    :class="[itemRowClasses, rarityBorderClass]"
  >
    <div class="px-3 py-2.5">
      <div class="mx-0 flex flex-nowrap items-center">
        <div class="flex min-w-0 flex-1 items-center p-0">
          <span class="block h-12 w-12 shrink-0 md:h-16 md:w-16">
            <GameItem
              :image-item="resolvedImageItem"
              :src="resolvedImageItem?.iconLink"
              :is-visible="isVisible"
              :item-id="item?.id"
              :item-name="item?.name ?? null"
              :wiki-link="item?.wikiLink ?? null"
              :dev-link="item?.link ?? null"
              :task-wiki-link="relatedTask?.wikiLink"
              size="small"
              simple-mode
            />
          </span>
          <span class="ml-3 flex min-w-0 flex-1 flex-col overflow-hidden">
            <span class="flex items-center truncate text-sm font-semibold">
              <span class="truncate">{{ item?.name ?? '' }}</span>
              <AcceptedItemsPopover
                v-if="hasAlternativeItems"
                v-model:open="acceptedItemsOpen"
                :items="acceptedItems"
                :cycling="isCyclingItems"
                trigger-class="bg-surface-700/80 text-surface-200 ml-1.5 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1 ring-white/5"
              />
              <ItemIndicators
                :found-in-raid="isFoundInRaid"
                :is-craftable="isCraftable"
                :craftable-title="craftableTitle"
                :craftable-icon-class="craftableIconClass"
                :kappa-required="isKappaRequired"
                :lightkeeper-required="isLightkeeperRequired"
                @craft="goToCraftStation"
              />
            </span>
            <span class="mt-1">
              <template v-if="props.need.needType === 'taskObjective'">
                <TaskLink v-if="relatedTask" :task="relatedTask" />
                <span v-else class="text-surface-300 text-sm">
                  {{ $t('needed_items.unknown_task') }}
                </span>
                <span class="mt-1 flex">
                  <NeededItemStatusPill
                    :handed-over="isHandedOver"
                    :collected="isCollected"
                    :hidden-for-self="hiddenForSelf"
                    :hint="hiddenForSelfHint"
                  />
                </span>
              </template>
              <span
                v-else-if="props.need.needType === 'hideoutModule'"
                class="flex items-center gap-1"
              >
                <StationLink
                  v-if="relatedStation"
                  :station="relatedStation"
                  :module-id="props.need.hideoutModule.id"
                />
                <span v-else class="text-surface-300 text-sm">
                  {{ $t('needed_items.unknown_station') }}
                </span>
                <span class="text-surface-300 text-sm">
                  {{ $t('common.lvl_level', { level: props.need.hideoutModule.level }) }}
                </span>
              </span>
            </span>
          </span>
        </div>
        <div class="ml-2 flex shrink-0 flex-col items-end justify-center">
          <div v-if="belowMd" class="mr-2 block">
            <UButton
              variant="ghost"
              color="neutral"
              class="m-0 p-0 px-1"
              :aria-label="hiddenForSelf ? hiddenForSelfHint : undefined"
              @click="isSingleItem && !hiddenForSelf ? $emit('toggleCount') : (smallDialog = true)"
            >
              <template v-if="hiddenForSelf">
                <UIcon name="i-mdi-account-group" class="text-surface-300 h-5 w-5" />
              </template>
              <template v-else-if="isSingleItem">
                <UIcon
                  name="i-mdi-check-circle"
                  class="h-5 w-5"
                  :class="isCollected ? 'text-success-400' : 'text-surface-300'"
                />
              </template>
              <template v-else>
                {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
              </template>
            </UButton>
            <UModal
              v-model:open="smallDialog"
              :ui="{
                content: 'w-11/12 bg-transparent border-0 p-0 shadow-none ring-0 outline-none',
              }"
            >
              <template #content>
                <UCard>
                  <div class="flex h-full flex-col items-end">
                    <!-- Item image -->
                    <div class="flex aspect-video min-h-25 self-stretch">
                      <GameItem
                        v-if="resolvedImageItem"
                        :image-item="resolvedImageItem"
                        :src="resolvedImageItem?.image512pxLink"
                        :is-visible="true"
                        :item-id="item?.id"
                        :item-name="item?.name ?? null"
                        :wiki-link="item?.wikiLink ?? null"
                        :dev-link="item?.link ?? null"
                        :task-wiki-link="relatedTask?.wikiLink"
                        size="large"
                        simple-mode
                      />
                    </div>
                    <div class="mx-2 mt-2 flex items-center self-center">
                      <div class="px-2 text-center">
                        {{ item?.name ?? '' }}
                      </div>
                      <ItemIndicators
                        :found-in-raid="isFoundInRaid"
                        fir-icon-class="ml-1 h-4 w-4"
                        :is-craftable="isCraftable"
                        :craftable-title="craftableTitle"
                        craftable-icon-base-class="ml-1 h-4 w-4"
                        :craftable-icon-class="craftableIconClass"
                        :kappa-required="isKappaRequired"
                        kappa-icon-class="ml-1 h-4 w-4 text-kappa"
                        :lightkeeper-required="isLightkeeperRequired"
                        lightkeeper-icon-class="ml-1 h-4 w-4 text-lightkeeper"
                        @craft="goToCraftStation"
                      />
                    </div>
                    <!-- Item need details -->
                    <div class="mx-2 mt-2 flex w-full flex-col self-center">
                      <template v-if="props.need.needType === 'taskObjective'">
                        <TaskLink v-if="relatedTask" :task="relatedTask" />
                        <span v-else class="text-surface-300 text-sm">
                          {{ $t('needed_items.unknown_task') }}
                        </span>
                        <span class="mt-1 flex">
                          <NeededItemStatusPill
                            :handed-over="isHandedOver"
                            :collected="isCollected"
                            :hidden-for-self="hiddenForSelf"
                            :hint="hiddenForSelfHint"
                          />
                        </span>
                      </template>
                      <template v-else-if="props.need.needType === 'hideoutModule'">
                        <div class="mt-1 mb-1 flex items-center justify-center gap-1">
                          <StationLink
                            v-if="relatedStation"
                            :station="relatedStation"
                            :module-id="props.need.hideoutModule.id"
                            class="justify-center"
                          />
                          <span v-else class="text-surface-300 text-sm">
                            {{ $t('needed_items.unknown_station') }}
                          </span>
                          <span class="text-surface-300 text-sm">
                            {{ $t('common.lvl_level', { level: props.need.hideoutModule.level }) }}
                          </span>
                        </div>
                      </template>
                      <RequirementInfo
                        class="mt-1 justify-center text-sm"
                        :level-required="levelRequired"
                        :locked-before="lockedBefore"
                        :player-level="tarkovStore.playerLevel()"
                      />
                    </div>
                    <!-- Item count actions -->
                    <div
                      v-if="hiddenForSelf || !selfCompletedNeed"
                      class="mx-2 mt-2 mb-2 flex h-full flex-col items-center justify-center self-stretch"
                    >
                      <template v-if="hiddenForSelf" />
                      <template v-else-if="!isSingleItem">
                        <ItemCountControls
                          :current-count="currentCount"
                          :needed-count="neededCount"
                          @decrease="$emit('decreaseCount')"
                          @increase="$emit('increaseCount')"
                          @toggle="$emit('toggleCount')"
                          @set-count="(count) => $emit('setCount', count)"
                        />
                      </template>
                      <template v-else>
                        <NeededItemCollectButton
                          :collected="isCollected"
                          size="md"
                          @toggle="$emit('toggleCount')"
                        />
                      </template>
                      <!-- Show team needs alongside controls -->
                      <TeamNeedsDisplay
                        v-if="teamNeeds.length > 0"
                        :team-needs="teamNeeds"
                        :needed-count="neededCount"
                        class="mt-2"
                      />
                    </div>
                    <!-- Show static count for completed parent items (Completed tab) -->
                    <div
                      v-else
                      class="mx-2 mt-2 mb-2 flex h-full items-center justify-center self-stretch"
                    >
                      <span class="text-success-400 text-sm font-semibold">
                        {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
                      </span>
                    </div>
                  </div>
                </UCard>
              </template>
            </UModal>
          </div>
          <div v-else class="flex flex-row">
            <RequirementInfo
              class="mr-2 self-center text-sm"
              :level-required="levelRequired"
              :locked-before="lockedBefore"
              :player-level="tarkovStore.playerLevel()"
            />
            <div
              v-if="hiddenForSelf || !selfCompletedNeed"
              class="mr-2 flex items-center gap-3 self-center"
            >
              <template v-if="hiddenForSelf" />
              <template v-else-if="!isSingleItem">
                <ItemCountControls
                  :current-count="currentCount"
                  :needed-count="neededCount"
                  @decrease="$emit('decreaseCount')"
                  @increase="$emit('increaseCount')"
                  @toggle="$emit('toggleCount')"
                  @set-count="(count) => $emit('setCount', count)"
                />
              </template>
              <template v-else>
                <NeededItemCollectButton :collected="isCollected" @toggle="$emit('toggleCount')" />
              </template>
              <!-- Show team needs alongside controls -->
              <TeamNeedsDisplay
                v-if="teamNeeds.length > 0"
                :team-needs="teamNeeds"
                :needed-count="neededCount"
              />
            </div>
            <!-- Show static count for completed parent items -->
            <div v-else class="mr-2 flex items-center justify-center self-center">
              <span class="text-success-400 text-sm font-semibold">
                {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useItemRowIntersection } from '@/composables/useItemRowIntersection';
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import {
    createDefaultNeededItemContext,
    neededItemKey,
    type NeededItemContext,
  } from '@/features/neededitems/neededitem-keys';
  import NeededItemCollectButton from '@/features/neededitems/NeededItemCollectButton.vue';
  import {
    neededItemBorderClass,
    neededItemSurfaceClass,
  } from '@/features/neededitems/neededItemStateClasses';
  import NeededItemStatusPill from '@/features/neededitems/NeededItemStatusPill.vue';
  import RequirementInfo from '@/features/neededitems/RequirementInfo.vue';
  import TeamNeedsDisplay from '@/features/neededitems/TeamNeedsDisplay.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  const TaskLink = defineAsyncComponent(() => import('@/features/tasks/TaskLink.vue'));
  const StationLink = defineAsyncComponent(() => import('@/features/hideout/StationLink.vue'));
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      initiallyVisible?: boolean;
    }>(),
    {
      initiallyVisible: false,
    }
  );
  const { belowMd } = useSharedBreakpoints();
  const tarkovStore = useTarkovStore();
  const formatNumber = useLocaleNumberFormatter();
  const smallDialog = ref(false);
  const neededItemContext: NeededItemContext = inject(
    neededItemKey,
    createDefaultNeededItemContext()
  );
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
    hiddenForSelf,
    hiddenForSelfHint,
    imageItem,
    acceptedItems,
    hasAlternativeItems,
    isCyclingItems,
    setCyclingPaused,
  } = neededItemContext;
  const resolvedImageItem = computed(() => imageItem.value ?? undefined);
  const isFoundInRaid = computed(() => Boolean(props.need.foundInRaid));
  const acceptedItemsOpen = ref(false);
  watch(acceptedItemsOpen, (isOpen) => setCyclingPaused(isOpen));
  onBeforeUnmount(() => setCyclingPaused(false));
  const cardRef = ref<HTMLElement | null>(null);
  const { isVisible } = useItemRowIntersection(cardRef, {
    initialVisible: props.initiallyVisible,
  });
  const itemRowClasses = computed(() =>
    neededItemSurfaceClass(
      !hiddenForSelf.value && (selfCompletedNeed.value || isCollected.value),
      'l'
    )
  );
  const rarityBorderClass = computed(() =>
    neededItemBorderClass(imageItem.value?.backgroundColor, props.need.needType)
  );
  const isSingleItem = computed(() => neededCount.value === 1);
  const isCollected = computed(() => currentCount.value >= neededCount.value);
  const isHandedOver = computed(() => {
    if (props.need.needType !== 'taskObjective') return false;
    if (selfCompletedNeed.value) return true;
    return tarkovStore.isTaskObjectiveComplete(props.need.id);
  });
  defineEmits<{
    (event: 'decreaseCount' | 'increaseCount' | 'toggleCount'): void;
    (event: 'setCount', count: number): void;
  }>();
</script>
