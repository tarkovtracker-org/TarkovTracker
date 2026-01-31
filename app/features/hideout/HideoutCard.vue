<template>
  <GenericCard
    :id="stationAnchorId"
    :avatar="stationAvatar"
    :highlight-color="getHighlightColor()"
    :avatar-height="50"
    :fill-height="false"
    class="relative overflow-visible rounded-lg"
    header-classes="pb-2"
  >
    <template #header>
      <div class="flex items-center justify-between pb-2 text-xl">
        <!-- Left side content (icon and title with level badge) -->
        <div class="flex items-center gap-3">
          <!-- Station Avatar -->
          <span :class="highlightClasses" class="inline-block rounded-br-lg px-3 py-1 shadow-lg">
            <img :src="stationAvatar" :height="50" :style="{ height: '50px' }" class="block pt-0" />
          </span>
          <!-- Title and Level Badge -->
          <div class="flex items-center gap-2">
            <span class="inline-block text-left leading-6">
              {{ station.name }}
            </span>
            <div
              v-if="!upgradeDisabled"
              class="rounded-md px-2.5 py-0.5"
              :class="
                prerequisitesMet
                  ? 'bg-success-500/20 border-success-500/50 border'
                  : 'border border-red-500/50 bg-red-500/20'
              "
            >
              <span
                class="text-xs font-semibold"
                :class="prerequisitesMet ? 'text-success-400' : 'text-red-400'"
              >
                <template v-if="prerequisitesMet">
                  <i18n-t
                    keypath="page.hideout.stationcard.level"
                    scope="global"
                    :plural="progressStore.hideoutLevels?.[props.station.id]?.self || 0"
                  >
                    <template #level>
                      {{ progressStore.hideoutLevels?.[props.station.id]?.self || 0 }}
                    </template>
                  </i18n-t>
                </template>
                <template v-else>
                  {{ $t('page.hideout.stationcard.levelnotready') }}
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>
      <!-- Divider -->
      <div class="border-surface-700 mx-4 border-b"></div>
    </template>
    <template #content>
      <!-- Station description -->
      <div v-if="currentLevel" class="mx-2 mb-3 text-left text-sm leading-relaxed text-gray-300">
        {{ getStashAdjustedDescription(currentLevel.description) }}
      </div>
      <div v-else-if="nextLevel" class="mx-2 mb-3 text-left text-sm leading-relaxed text-gray-300">
        {{ getStashAdjustedDescription(nextLevel.description) }}
      </div>
      <!-- Stash station special content -->
      <div
        v-if="props.station.normalizedName === SPECIAL_STATIONS.STASH"
        class="mb-3 rounded-lg bg-gray-700 p-3 text-center"
      >
        <div class="mb-2 text-sm">
          {{ $t('page.hideout.stationcard.gameeditiondescription') }}
        </div>
        <UButton variant="soft" to="/settings" color="neutral">
          {{ $t('page.hideout.stationcard.settingsbutton') }}
        </UButton>
      </div>
      <!-- Next level requirements -->
      <div v-if="nextLevel" class="space-y-3">
        <!-- Item Requirements Section -->
        <div v-if="hasItemRequirements" class="rounded-lg bg-gray-800 p-3">
          <div class="mb-3 flex items-center text-base font-medium">
            <UIcon name="i-mdi-package-variant-closed-check" class="mr-2 h-5 w-5 text-green-500" />
            {{ $t('page.hideout.stationcard.nextlevel') }}
          </div>
          <!-- Item Requirements Grid -->
          <div class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <HideoutRequirement
              v-for="requirement in nextLevel.itemRequirements"
              :key="requirement.id"
              :requirement="requirement"
              :station-id="props.station.id"
              :level="nextLevel.level"
            />
          </div>
          <!-- Prerequisites Section -->
          <div v-if="hasPrerequisites" class="space-y-2 border-t border-gray-700 pt-3">
            <div class="mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
              {{ $t('page.hideout.stationcard.prerequisites') || 'Prerequisites' }}
            </div>
            <!-- Station Level Requirements -->
            <div
              v-for="(requirement, rIndex) in nextLevel.stationLevelRequirements"
              :key="`station-${rIndex}`"
              class="flex items-center gap-2 text-sm"
              :class="isStationReqMet(requirement) ? 'text-gray-300' : 'font-semibold text-red-400'"
            >
              <UIcon
                name="i-mdi-home"
                class="h-4 w-4"
                :class="isStationReqMet(requirement) ? 'text-blue-500' : 'text-red-500'"
              />
              <i18n-t keypath="page.hideout.stationcard.requirements.station" scope="global">
                <template #level>
                  {{ requirement.level }}
                </template>
                <template #stationname>
                  {{ requirement.station.name }}
                </template>
              </i18n-t>
            </div>
            <!-- Skill Requirements -->
            <div
              v-for="(requirement, rIndex) in nextLevel.skillRequirements"
              :key="`skill-${rIndex}`"
              class="flex items-center gap-2 text-sm"
              :class="isSkillReqMet(requirement) ? 'text-gray-300' : 'font-semibold text-red-400'"
            >
              <UIcon
                name="i-mdi-star"
                class="h-4 w-4"
                :class="isSkillReqMet(requirement) ? 'text-yellow-500' : 'text-red-500'"
              />
              <i18n-t keypath="page.hideout.stationcard.requirements.skill" scope="global">
                <template #level>
                  {{ requirement.level }}
                </template>
                <template #skillname>
                  {{ requirement.name }}
                </template>
              </i18n-t>
            </div>
            <!-- Trader Requirements -->
            <div
              v-for="(requirement, rIndex) in nextLevel.traderRequirements"
              :key="`trader-${rIndex}`"
              class="flex items-center gap-2 text-sm"
              :class="isTraderReqMet(requirement) ? 'text-gray-300' : 'font-semibold text-red-400'"
            >
              <UIcon
                name="i-mdi-account-tie"
                class="h-4 w-4"
                :class="isTraderReqMet(requirement) ? 'text-purple-500' : 'text-red-500'"
              />
              <i18n-t keypath="page.hideout.stationcard.requirements.trader" scope="global">
                <template #loyaltylevel>
                  {{ requirement.value }}
                </template>
                <template #tradername>
                  {{ requirement.trader.name }}
                </template>
              </i18n-t>
            </div>
          </div>
        </div>
      </div>
      <!-- Max level indicator -->
      <div v-if="!nextLevel" class="rounded bg-gray-800 p-3">
        <div
          class="flex items-center justify-center text-center text-base font-medium text-yellow-500"
        >
          <UIcon name="i-mdi-star-check" class="mr-2 h-6 w-6" />
          {{ $t('page.hideout.stationcard.maxlevel') }}
        </div>
      </div>
    </template>
    <template #footer>
      <div class="p-2">
        <div v-if="!upgradeDisabled" class="flex flex-col gap-2">
          <UButton
            v-if="nextLevel?.level"
            color="success"
            variant="solid"
            size="lg"
            block
            :ui="upgradeButtonUi"
            @click="upgradeStation()"
          >
            <i18n-t
              keypath="page.hideout.stationcard.upgradebutton"
              scope="global"
              :plural="nextLevel?.level"
            >
              <template #level>
                {{ nextLevel?.level }}
              </template>
            </i18n-t>
          </UButton>
          <UButton
            v-if="currentLevel && !downgradeDisabled"
            size="sm"
            block
            :ui="downgradeButtonUi"
            @click="downgradeStation()"
          >
            <i18n-t
              keypath="page.hideout.stationcard.downgradebutton"
              scope="global"
              :plural="(progressStore.hideoutLevels?.[props.station.id]?.self || 0) - 1"
            >
              <template #level>
                {{ (progressStore.hideoutLevels?.[props.station.id]?.self || 0) - 1 }}
              </template>
            </i18n-t>
          </UButton>
        </div>
        <div v-if="upgradeDisabled" class="flex flex-wrap items-center justify-center gap-2">
          <UButton
            v-if="currentLevel && !downgradeDisabled"
            size="sm"
            :ui="downgradeButtonUi"
            @click="downgradeStation()"
          >
            <i18n-t
              keypath="page.hideout.stationcard.downgradebutton"
              scope="global"
              :plural="(progressStore.hideoutLevels?.[props.station.id]?.self || 0) - 1"
            >
              <template #level>
                {{ (progressStore.hideoutLevels?.[props.station.id]?.self || 0) - 1 }}
              </template>
            </i18n-t>
          </UButton>
          <span
            v-if="nextLevel && (!currentLevel || downgradeDisabled)"
            class="text-sm text-gray-400"
          >
            {{ t('page.hideout.stationcard.upgradeunavailable') }}
          </span>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type {
    HideoutLevel,
    HideoutStation,
    ItemRequirement,
    SkillRequirement,
    StationLevelRequirement,
    TraderRequirement,
  } from '@/types/tarkov';
  import { SPECIAL_STATIONS } from '@/utils/constants';
  import { useToast } from '#imports';
  const GenericCard = defineAsyncComponent(() => import('@/components/ui/GenericCard.vue'));
  const HideoutRequirement = defineAsyncComponent(() => import('./HideoutRequirement.vue'));
  const props = defineProps<{ station: HideoutStation }>();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const stationAnchorId = computed(() => `station-${props.station.id}`);
  const upgradeButtonUi = {
    base: 'bg-success-500 hover:bg-success-600 active:bg-success-700 text-white border border-success-700',
  };
  const downgradeButtonUi = {
    base: 'bg-red-900/40 hover:bg-red-900/60 active:bg-red-900/80 text-red-300 border border-red-700/50',
  };
  const getHighlightColor = (): 'secondary' | 'green' | 'red' => {
    const level = progressStore.hideoutLevels?.[props.station.id]?.self ?? 0;
    if (level > 0) {
      return 'secondary';
    }
    return prerequisitesMet.value ? 'green' : 'red';
  };
  const highlightClasses = computed(() => {
    const color = getHighlightColor();
    const classes: Record<string, boolean> = {};
    switch (color) {
      case 'green':
        classes[
          'bg-gradient-to-r from-[rgba(1,36,0,0.15)] via-[rgba(15,121,9,0.15)] to-[rgba(0,83,0,0.15)]'
        ] = true;
        break;
      case 'red':
        classes[
          'bg-gradient-to-r from-[rgba(36,0,0,0.15)] via-[rgba(121,0,0,0.15)] to-[rgba(83,0,0,0.15)]'
        ] = true;
        break;
      case 'secondary':
        classes['bg-gradient-to-br from-brand-700 via-brand-300 to-brand-500'] = true;
        break;
      default:
        classes['bg-gradient-to-br from-accent-800 via-accent-700 to-accent-600'] = true;
        break;
    }
    return classes;
  });
  const isStationReqMet = (requirement: StationLevelRequirement) => {
    const currentStationLevel = progressStore.hideoutLevels?.[requirement.station.id]?.self || 0;
    return currentStationLevel >= requirement.level;
  };
  const isSkillReqMet = (requirement: SkillRequirement) => {
    if (!requirement?.name || typeof requirement?.level !== 'number') return true;
    const currentSkills =
      (tarkovStore.getCurrentProgressData?.() || {}).skills ||
      // progressStore currently stores skills under current progress data; fallback to empty
      {};
    const currentLevel =
      currentSkills?.[requirement.name] ?? tarkovStore.getSkillLevel(requirement.name);
    return currentLevel >= requirement.level;
  };
  const isTraderReqMet = (requirement: TraderRequirement) => {
    // Check user's current trader loyalty level against requirement
    if (!requirement?.trader?.id || typeof requirement?.value !== 'number') return true;
    const currentLevel = tarkovStore.getTraderLevel(requirement.trader.id);
    return currentLevel >= requirement.value;
  };
  const prerequisitesMet = computed(() => {
    if (!nextLevel.value) return true;
    // Check station level requirements
    const stationReqsMet =
      nextLevel.value.stationLevelRequirements?.every((req: StationLevelRequirement) => {
        return isStationReqMet(req);
      }) ?? true;
    // Check skill requirements
    const skillReqsMet =
      nextLevel.value.skillRequirements?.every((req: SkillRequirement) => {
        return isSkillReqMet(req);
      }) ?? true;
    // Check trader requirements
    const traderReqsMet =
      nextLevel.value.traderRequirements?.every((req: TraderRequirement) => {
        return isTraderReqMet(req);
      }) ?? true;
    return stationReqsMet && skillReqsMet && traderReqsMet;
  });
  const upgradeDisabled = computed(() => {
    return nextLevel.value === null;
  });
  const downgradeDisabled = computed(() => {
    if (props.station.normalizedName === SPECIAL_STATIONS.STASH) {
      const currentStash = progressStore.hideoutLevels?.[props.station.id]?.self ?? 0;
      const editionId = tarkovStore.getGameEdition();
      const editionData = progressStore.gameEditionData.find((e) => e.value === editionId);
      const defaultStash = editionData?.defaultStashLevel ?? 0;
      return currentStash <= defaultStash;
    }
    if (props.station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE) {
      const currentLevel = progressStore.hideoutLevels?.[props.station.id]?.self ?? 0;
      const editionId = tarkovStore.getGameEdition();
      const editionData = progressStore.gameEditionData.find((e) => e.value === editionId);
      const defaultCultistCircle = editionData?.defaultCultistCircleLevel ?? 0;
      return currentLevel <= defaultCultistCircle;
    }
    return false;
  });
  const nextLevel = computed<HideoutLevel | null>(() => {
    return (
      props.station.levels.find(
        (level: HideoutLevel) =>
          level.level === (progressStore.hideoutLevels?.[props.station.id]?.self || 0) + 1
      ) || null
    );
  });
  const currentLevel = computed<HideoutLevel | null>(() => {
    return (
      props.station.levels.find(
        (level: HideoutLevel) =>
          level.level === progressStore.hideoutLevels?.[props.station.id]?.self
      ) || null
    );
  });
  const hasItemRequirements = computed(() => {
    return (nextLevel.value?.itemRequirements?.length || 0) > 0;
  });
  const hasPrerequisites = computed(() => {
    return (
      (nextLevel.value?.stationLevelRequirements?.length ?? 0) > 0 ||
      (nextLevel.value?.skillRequirements?.length ?? 0) > 0 ||
      (nextLevel.value?.traderRequirements?.length ?? 0) > 0
    );
  });
  const stationAvatar = computed(() => props.station.imageLink);
  const getStashAdjustedDescription = (description: string | undefined) => {
    // Only modify description for stash station
    if (props.station.normalizedName !== SPECIAL_STATIONS.STASH) {
      return description;
    }
    // Check if user has an edition with max stash (Unheard editions have defaultStashLevel: 5)
    const editionId = tarkovStore.getGameEdition();
    const editionData = progressStore.gameEditionData.find((e) => e.value === editionId);
    const hasMaxStash = (editionData?.defaultStashLevel ?? 0) >= 5;
    // For editions with max stash, show static description with 10x72
    if (hasMaxStash) {
      return 'Maximum size stash (10x72)';
    }
    return description;
  };
  const upgradeStation = () => {
    // Store next level to a variable because it can change mid-function
    const upgradeLevel = nextLevel.value;
    if (!upgradeLevel) return;
    tarkovStore.setHideoutModuleComplete(upgradeLevel.id);
    // For each objective, mark it as complete
    upgradeLevel.itemRequirements.forEach((o: ItemRequirement) => {
      tarkovStore.setHideoutPartComplete(o.id);
    });
    toast.add({
      title: t('page.hideout.stationcard.statusupgraded', {
        name: props.station.name,
        level: upgradeLevel.level,
      }),
      color: 'success',
    });
  };
  const downgradeStation = () => {
    // Store current level to a variable because it can change mid-function
    const downgradeLevel = currentLevel.value;
    if (!downgradeLevel) return;
    tarkovStore.setHideoutModuleUncomplete(downgradeLevel.id);
    // For each objective, mark it as incomplete
    downgradeLevel.itemRequirements.forEach((o: ItemRequirement) => {
      tarkovStore.setHideoutPartUncomplete(o.id);
    });
    toast.add({
      title: t('page.hideout.stationcard.statusdowngraded', {
        name: props.station.name,
        level: downgradeLevel.level,
      }),
      color: 'error',
    });
  };
</script>
