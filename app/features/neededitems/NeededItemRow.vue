<template>
  <KeepAlive>
    <div ref="cardRef" class="mb-1 rounded" :class="itemRowClasses">
      <div class="px-3 py-2">
        <div class="mx-0 flex flex-nowrap items-center">
          <div class="flex min-w-0 flex-1 items-center p-0">
            <span class="block h-12 w-12 shrink-0 md:h-16 md:w-16">
              <GameItem
                :image-item="resolvedImageItem"
                :src="resolvedImageItem?.iconLink"
                :is-visible="isVisible"
                :item-name="item?.name ?? null"
                :wiki-link="item?.wikiLink ?? null"
                :dev-link="item?.link ?? null"
                :task-wiki-link="relatedTask?.wikiLink"
                size="small"
                simple-mode
              />
            </span>
            <span class="ml-3 flex min-w-0 flex-1 flex-col overflow-hidden">
              <span class="flex items-center truncate text-base font-semibold">
                <span class="truncate">{{ item?.name ?? '' }}</span>
                <ItemIndicators
                  :found-in-raid="isFoundInRaid"
                  :is-craftable="isCraftable"
                  :craftable-title="craftableTitle"
                  :craftable-icon-class="craftableIconClass"
                  :kappa-required="isKappaRequired"
                  :kappa-title="$t('needed_items.task_kappa_req')"
                  :lightkeeper-required="isLightkeeperRequired"
                  :lightkeeper-title="$t('page.tasks.questcard.lightkeeper_tooltip')"
                  @craft="goToCraftStation"
                />
              </span>
              <span class="mt-1">
                <template v-if="props.need.needType == 'taskObjective'">
                  <TaskLink v-if="relatedTask" :task="relatedTask" />
                  <span v-else class="text-surface-300 text-sm">
                    {{ $t('needed_items.unknown_task') }}
                  </span>
                </template>
                <template v-else-if="props.need.needType == 'hideoutModule'">
                  <StationLink
                    v-if="relatedStation"
                    :station="relatedStation"
                    :module-id="props.need.hideoutModule.id"
                  />
                  <span v-else class="text-surface-300 text-sm">
                    {{ $t('needed_items.unknown_station') }}
                  </span>
                </template>
              </span>
            </span>
          </div>
          <div class="ml-2 flex shrink-0 flex-col items-end justify-center">
            <div v-if="belowMd" class="mr-2 block">
              <UButton
                variant="ghost"
                color="neutral"
                class="m-0 p-0 px-1"
                @click="isSingleItem ? $emit('toggleCount') : (smallDialog = true)"
              >
                <template v-if="isSingleItem">
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
                          :kappa-title="$t('needed_items.task_kappa_req')"
                          kappa-icon-class="ml-1 h-4 w-4 text-kappa"
                          :lightkeeper-required="isLightkeeperRequired"
                          :lightkeeper-title="$t('page.tasks.questcard.lightkeeper_tooltip')"
                          lightkeeper-icon-class="ml-1 h-4 w-4 text-lightkeeper"
                          @craft="goToCraftStation"
                        />
                      </div>
                      <!-- Item need details -->
                      <div class="mx-2 mt-2 flex w-full flex-col self-center">
                        <template v-if="props.need.needType == 'taskObjective'">
                          <TaskLink v-if="relatedTask" :task="relatedTask" />
                          <span v-else class="text-surface-300 text-sm">
                            {{ $t('needed_items.unknown_task') }}
                          </span>
                          <RequirementInfo
                            :need-type="props.need.needType"
                            :level-required="levelRequired"
                            :locked-before="lockedBefore"
                            :player-level="tarkovStore.playerLevel()"
                          />
                        </template>
                        <template v-else-if="props.need.needType == 'hideoutModule'">
                          <div class="mt-1 mb-1 flex justify-center">
                            <div class="text-center">
                              <template v-if="relatedStation">
                                <StationLink
                                  :station="relatedStation"
                                  :module-id="props.need.hideoutModule.id"
                                  class="justify-center"
                                />
                              </template>
                              <template v-else>
                                <span class="text-surface-300 text-sm">
                                  {{ $t('needed_items.unknown_station') }}
                                </span>
                              </template>
                            </div>
                            <div class="ml-1">
                              {{ props.need.hideoutModule.level }}
                            </div>
                          </div>
                          <RequirementInfo
                            :need-type="props.need.needType"
                            :level-required="levelRequired"
                            :locked-before="lockedBefore"
                            :player-level="tarkovStore.playerLevel()"
                            :related-station="relatedStation"
                            :hideout-level="props.need.hideoutModule.level"
                            :hideout-module-id="props.need.hideoutModule.id"
                          />
                        </template>
                      </div>
                      <!-- Item count actions -->
                      <div
                        v-if="!selfCompletedNeed"
                        class="mx-2 mt-2 mb-2 flex h-full flex-col items-center justify-center self-stretch"
                      >
                        <template v-if="!isSingleItem">
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
                          <AppTooltip
                            :text="
                              isCollected
                                ? $t('needed_items.collected')
                                : $t('needed_items.mark_collected')
                            "
                          >
                            <CollectedToggleButton
                              :is-collected="isCollected"
                              class="flex h-10 w-10 items-center justify-center rounded-lg border transition-colors"
                              :class="
                                isCollected
                                  ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
                                  : 'bg-surface-700 text-surface-200 hover:bg-surface-600 border-white/20 hover:text-white'
                              "
                              :aria-label="
                                isCollected
                                  ? $t('needed_items.collected')
                                  : $t('needed_items.mark_collected')
                              "
                              icon-class="h-6 w-6"
                              @toggle="$emit('toggleCount')"
                            />
                          </AppTooltip>
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
              <div v-if="mdAndUp" class="mr-2 flex justify-between self-center">
                <template v-if="props.need.needType == 'taskObjective'">
                  <RequirementInfo
                    :need-type="props.need.needType"
                    :level-required="levelRequired"
                    :locked-before="lockedBefore"
                    :player-level="tarkovStore.playerLevel()"
                  />
                </template>
                <template v-else-if="props.need.needType == 'hideoutModule'">
                  <RequirementInfo
                    :need-type="props.need.needType"
                    :level-required="levelRequired"
                    :locked-before="lockedBefore"
                    :player-level="tarkovStore.playerLevel()"
                    :related-station="relatedStation"
                    :hideout-level="props.need.hideoutModule.level"
                    :hideout-module-id="props.need.hideoutModule.id"
                  />
                </template>
              </div>
              <div v-if="!selfCompletedNeed" class="mr-2 flex items-center gap-3 self-center">
                <template v-if="!isSingleItem">
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
                  <AppTooltip
                    :text="
                      isCollected ? $t('needed_items.collected') : $t('needed_items.mark_collected')
                    "
                  >
                    <CollectedToggleButton
                      :is-collected="isCollected"
                      class="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
                      :class="
                        isCollected
                          ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
                          : 'bg-surface-700 text-surface-200 hover:bg-surface-600 border-white/20 hover:text-white'
                      "
                      :aria-label="
                        isCollected
                          ? $t('needed_items.collected')
                          : $t('needed_items.mark_collected')
                      "
                      icon-class="h-6 w-6"
                      @toggle="$emit('toggleCount')"
                    />
                  </AppTooltip>
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
  </KeepAlive>
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
  // Use shared breakpoints to avoid duplicate listeners
  const { belowMd, mdAndUp } = useSharedBreakpoints();
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
    imageItem,
  } = neededItemContext;
  const resolvedImageItem = computed(() => imageItem.value ?? undefined);
  const isFoundInRaid = computed(() => Boolean(props.need.foundInRaid));
  // Intersection observer for lazy loading
  const cardRef = ref<HTMLElement | null>(null);
  const { isVisible } = useItemRowIntersection(cardRef, {
    initialVisible: props.initiallyVisible,
  });
  const itemRowClasses = computed(() => {
    return {
      'bg-gradient-to-l from-complete to-surface':
        selfCompletedNeed.value || currentCount.value >= neededCount.value,
      'bg-surface-800': !(selfCompletedNeed.value || currentCount.value >= neededCount.value),
    };
  });
  const isSingleItem = computed(() => neededCount.value === 1);
  const isCollected = computed(() => currentCount.value >= neededCount.value);
  defineEmits<{
    (event: 'decreaseCount' | 'increaseCount' | 'toggleCount'): void;
    (event: 'setCount', count: number): void;
  }>();
</script>
