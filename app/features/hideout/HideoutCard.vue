<template>
  <GenericCard
    :id="stationAnchorId"
    :avatar="stationAvatar"
    :highlight-color="highlightColor"
    :avatar-height="50"
    :fill-height="false"
    :show-divider="false"
    class="relative rounded-lg"
    :class="cardHighlightClasses"
    header-classes="pb-1.5 sm:pb-2"
    @mouseenter="dismissHighlight"
    @focusin="dismissHighlight"
  >
    <template #header>
      <div
        class="flex items-start justify-between gap-2.5 pb-1.5 text-base sm:items-center sm:gap-3 sm:pb-2 sm:text-lg"
      >
        <!-- Left side content (icon and title with level badge) -->
        <div class="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
          <!-- Station Avatar -->
          <span
            :class="highlightClasses"
            class="inline-flex shrink-0 items-center justify-center rounded-br-lg px-2.5 py-1 shadow-lg sm:px-3"
          >
            <img :src="stationAvatar" alt="" class="block h-8 w-8 pt-0 sm:h-9 sm:w-9" />
          </span>
          <!-- Title and Level Badge -->
          <div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="inline-block min-w-0 text-left leading-5 font-medium sm:leading-6">
              {{ station.name }}
            </span>
            <div
              v-if="!upgradeDisabled"
              class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-none font-semibold sm:px-2.5 sm:text-xs"
              :class="
                prerequisitesMet
                  ? 'bg-success-500/20 border-success-500/50 text-success-400'
                  : 'border-locked-500/50 bg-locked-500/20 text-locked-400'
              "
            >
              <span class="whitespace-nowrap">{{ stationBadge }}</span>
            </div>
            <div
              v-if="highlightedLevel"
              class="border-primary-500/60 bg-primary-500/10 text-primary-200 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold sm:text-xs"
            >
              <UIcon name="i-mdi-link-variant" class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <i18n-t
                keypath="page.hideout.stationcard.level"
                scope="global"
                :plural="highlightedLevel.level"
              >
                <template #level>{{ highlightedLevel.level }}</template>
              </i18n-t>
            </div>
          </div>
        </div>
        <!-- Collapse Toggle -->
        <UButton
          :icon="isContentVisible ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
          :aria-label="isContentVisible ? $t('hideout.collapse') : $t('hideout.expand')"
          color="neutral"
          variant="ghost"
          size="sm"
          class="mt-0.5 -mr-1 shrink-0 sm:mt-0"
          @click="isContentVisible = !isContentVisible"
        />
      </div>
    </template>
    <template #content>
      <div v-if="isContentVisible">
        <!-- Stash station special content -->
        <div
          v-if="props.station.normalizedName === SPECIAL_STATIONS.STASH"
          class="bg-surface-700 mb-2.5 rounded-lg p-2.5 text-center sm:mb-3 sm:p-3"
        >
          <div class="mb-2 text-xs sm:text-sm">
            {{ $t('page.hideout.stationcard.game_edition_description') }}
          </div>
          <UButton variant="soft" to="/settings" color="neutral">
            {{ $t('page.hideout.stationcard.settings_button') }}
          </UButton>
        </div>
        <!-- Next level requirements -->
        <div
          v-if="nextLevel && hasRequirements"
          class="bg-surface-800 relative rounded-lg p-2.5 sm:p-3"
          :class="moduleHighlightClasses"
        >
          <div class="mb-2.5 flex items-center text-sm font-medium sm:mb-3 sm:text-base">
            <UIcon
              name="i-mdi-package-variant-closed-check"
              class="text-success-500 light:text-success-800 mr-1.5 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
            />
            {{ $t('page.hideout.stationcard.next_level') }}
          </div>
          <!-- Item Requirements Grid -->
          <div
            v-if="hasItemRequirements"
            class="mb-2.5 grid gap-2 sm:mb-3"
            :class="
              inlineMaterials
                ? 'grid-cols-1'
                : 'grid-cols-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5'
            "
          >
            <HideoutRequirement
              v-for="requirement in nextLevel.itemRequirements"
              :key="requirement.id"
              :requirement="requirement"
              :inline="inlineMaterials"
              :station-id="props.station.id"
              :level="nextLevel.level"
            />
          </div>
          <HideoutPrerequisites :level="nextLevel" />
        </div>
        <!-- Max level indicator -->
        <div v-if="!nextLevel" class="bg-surface-800 rounded p-2.5 sm:p-3">
          <div
            class="text-warning-500 light:text-warning-800 flex items-center justify-center text-center text-sm font-medium sm:text-base"
          >
            <UIcon name="i-mdi-star-check" class="mr-1.5 h-5 w-5 sm:mr-2 sm:h-6 sm:w-6" />
            {{ $t('page.hideout.stationcard.max_level') }}
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div v-if="isContentVisible" class="p-1.5 sm:p-2">
        <div :class="actionLayout">
          <UButton
            v-if="nextLevel"
            color="success"
            variant="solid"
            size="md"
            block
            :ui="upgradeButtonUi"
            @click="upgradeStation"
          >
            {{ upgradeLabel }}
          </UButton>
          <UButton
            v-if="canDowngrade"
            size="sm"
            :block="!upgradeDisabled"
            :ui="downgradeButtonUi"
            @click="downgradeStation"
          >
            {{ downgradeLabel }}
          </UButton>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { useToast } from '#imports';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useAnalyticsEvents } from '@/composables/useAnalyticsEvents';
  import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
  import HideoutPrerequisites from '@/features/hideout/HideoutPrerequisites.vue';
  import HideoutRequirement from '@/features/hideout/HideoutRequirement.vue';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { CARD_HIGHLIGHT_GRADIENTS } from '@/utils/cardHighlights';
  import { SPECIAL_STATIONS } from '@/utils/constants';
  import type { HideoutLevel, HideoutStation, ItemRequirement } from '@/types/tarkov';
  const props = withDefaults(
    defineProps<{
      station: HideoutStation;
      inlineMaterials?: boolean;
      highlighted?: boolean;
      highlightModuleId?: string | null;
    }>(),
    {
      highlighted: false,
      highlightModuleId: null,
    }
  );
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { trackEvent } = useAnalyticsEvents();
  const { arePrereqsMet } = useHideoutStationStatus();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const isContentVisible = ref(true);
  const highlightDismissed = ref(false);
  watch(
    () => [props.highlighted, props.highlightModuleId],
    ([highlighted, highlightModuleId]) => {
      if (highlighted || highlightModuleId) {
        highlightDismissed.value = false;
        isContentVisible.value = true;
      }
    },
    { immediate: true }
  );
  const stationAnchorId = computed(() => `station-${props.station.id}`);
  const upgradeButtonUi = {
    base: 'bg-success-500 hover:bg-success-600 active:bg-success-700 text-white border border-success-700',
  };
  const downgradeButtonUi = {
    base: 'bg-error-900/40 light:bg-error-50 hover:bg-error-900/60 light:hover:bg-error-100 active:bg-error-900/80 light:active:bg-error-100 text-error-300 border border-error-700/50',
  };
  // A station whose next level is blocked by prerequisites uses the shared Locked color.
  const highlightColor = computed((): 'success' | 'locked' | 'primary' => {
    if (!nextLevel.value) return 'primary';
    return prerequisitesMet.value ? 'success' : 'locked';
  });
  const highlightClasses = computed(() => ({
    [CARD_HIGHLIGHT_GRADIENTS[highlightColor.value]]: true,
  }));
  const prerequisitesMet = computed(() => {
    if (!nextLevel.value) return true;
    return arePrereqsMet(nextLevel.value);
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
  const stationBadge = computed(() => {
    const level = progressStore.hideoutLevels?.[props.station.id]?.self ?? 0;
    if (props.inlineMaterials)
      return level ? t('page.hideout.map.level', { level }) : t('page.hideout.map.not_built');
    return prerequisitesMet.value
      ? t('page.hideout.stationcard.level', { level, count: level }, level)
      : t('page.hideout.stationcard.level_not_ready');
  });
  const actionLayout = computed(() =>
    upgradeDisabled.value
      ? 'flex flex-wrap items-center justify-center gap-2'
      : 'flex flex-col gap-1.5 sm:gap-2'
  );
  const canDowngrade = computed(() => !!currentLevel.value && !downgradeDisabled.value);
  const upgradeLabel = computed(() => {
    const level = nextLevel.value?.level ?? 0;
    return props.inlineMaterials
      ? t('page.hideout.map.record_built', { level })
      : t('page.hideout.stationcard.upgrade_button', { level }, level);
  });
  const downgradeLabel = computed(() => {
    const level = (currentLevel.value?.level ?? 0) - 1;
    return t('page.hideout.stationcard.downgrade_button', { level }, level);
  });
  const hasItemRequirements = computed(() => {
    return (nextLevel.value?.itemRequirements?.length || 0) > 0;
  });
  const hasRequirements = computed(() => {
    const level = nextLevel.value;
    return (
      level &&
      [
        level.itemRequirements,
        level.stationLevelRequirements,
        level.skillRequirements,
        level.traderRequirements,
      ].some((rows) => rows.length > 0)
    );
  });
  const stationAvatar = computed(() => props.station.imageLink);
  const highlightedLevel = computed(() => {
    if (!props.highlightModuleId) return null;
    return props.station.levels.find((level) => level.id === props.highlightModuleId) || null;
  });
  const highlightActive = computed(() => {
    return (props.highlighted || highlightedLevel.value) && !highlightDismissed.value;
  });
  const highlightMatchesNext = computed(() => {
    if (!highlightedLevel.value || !nextLevel.value) return false;
    return highlightedLevel.value.id === nextLevel.value.id;
  });
  const highlightTargetsModule = computed(() => {
    return highlightMatchesNext.value && hasItemRequirements.value;
  });
  const cardHighlightClasses = computed(() => {
    if (!highlightActive.value || highlightTargetsModule.value) return '';
    return 'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-2 after:ring-primary-400/70 after:ring-offset-2 after:ring-offset-surface-900 after:content-[""] after:animate-pulse';
  });
  const moduleHighlightClasses = computed(() => {
    if (!highlightActive.value || !highlightTargetsModule.value) return '';
    return 'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-2 after:ring-primary-400/70 after:ring-offset-2 after:ring-offset-surface-800 after:content-[""] after:animate-pulse';
  });
  const dismissHighlight = () => {
    if (!highlightActive.value) return;
    highlightDismissed.value = true;
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
    trackEvent('hideout_upgrade', {
      game_mode: tarkovStore.getCurrentGameMode(),
      hideout_module_id: upgradeLevel.id,
      hideout_station_id: props.station.id,
      hideout_station_name: props.station.name,
      level: upgradeLevel.level,
      prerequisite_status: prerequisitesMet.value ? 'ready' : 'blocked',
    });
    toast.add({
      title: t('page.hideout.stationcard.status_upgraded', {
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
    trackEvent('hideout_downgrade', {
      game_mode: tarkovStore.getCurrentGameMode(),
      hideout_module_id: downgradeLevel.id,
      hideout_station_id: props.station.id,
      hideout_station_name: props.station.name,
      level: downgradeLevel.level,
    });
    toast.add({
      title: t('page.hideout.stationcard.status_downgraded', {
        name: props.station.name,
        level: downgradeLevel.level,
      }),
      color: 'error',
    });
  };
</script>
