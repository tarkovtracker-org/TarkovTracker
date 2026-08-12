<template>
  <GenericCard
    icon="mdi-star-circle"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="$t('settings.experience.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <div
          role="button"
          tabindex="0"
          class="group bg-surface-900/70 hover:border-surface-600 focus-visible:ring-primary-500/30 flex w-full items-center justify-between gap-3 rounded-lg border border-white/8 px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :aria-pressed="preferencesStore.getUseAutomaticLevelCalculation"
          @click="handleAutoLevelRowClick"
          @keydown.enter.prevent="toggleAutoLevel"
          @keydown.space.prevent="toggleAutoLevel"
        >
          <div class="flex items-center gap-2">
            <span class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.experience.auto_level_title') }}
            </span>
            <UTooltip :text="$t('settings.experience.auto_level_description')">
              <UIcon name="i-mdi-information" class="text-surface-400 h-4 w-4" />
            </UTooltip>
          </div>
          <USwitch
            :model-value="preferencesStore.getUseAutomaticLevelCalculation"
            :ui="{
              base: 'data-[state=unchecked]:bg-error-500 data-[state=checked]:bg-success-500',
            }"
            @update:model-value="setAutomaticLevelCalculation"
          />
        </div>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.experience.current_level') }}
            </span>
            <span class="text-primary-400 text-2xl font-bold">{{ derivedLevel }}</span>
          </div>
          <div class="space-y-1">
            <div class="text-surface-400 flex justify-between text-xs">
              <span>
                {{ $t('settings.experience.xp_amount', { amount: formatNumber(totalXP) }) }}
              </span>
              <span>
                {{ $t('settings.experience.xp_to_next', { amount: formatNumber(xpToNextLevel) }) }}
              </span>
            </div>
            <div
              role="progressbar"
              :aria-label="
                $t('settings.experience.xp_progress_aria', 'Experience progress toward next level')
              "
              :aria-valuenow="Math.round(xpProgress)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuetext="
                $t('settings.experience.xp_progress_value', { percent: Math.round(xpProgress) })
              "
              class="bg-surface-800/35 h-2 overflow-hidden rounded-full"
            >
              <div
                class="bg-primary-500/60 h-full rounded-full transition-[width] duration-300 ease-out"
                :style="{ width: `${xpProgress}%` }"
              ></div>
            </div>
          </div>
        </div>
        <div class="border-surface-700 bg-surface-800/40 space-y-3 rounded-lg border p-3">
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <label :for="totalXpInputId" class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.experience.set_total_xp') }}
              </label>
              <UTooltip :text="$t('settings.experience.manual_hint')">
                <UIcon name="i-mdi-information" class="text-surface-400 h-4 w-4" />
              </UTooltip>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UInput
                :id="totalXpInputId"
                v-model.number="manualXPInput"
                type="number"
                :min="0"
                :placeholder="totalXP.toString()"
                name="total-xp"
                size="sm"
                class="w-full min-w-0 sm:w-32"
              />
              <UButton
                icon="i-mdi-check"
                size="sm"
                color="primary"
                class="min-w-24"
                :disabled="!isValidXPInput"
                :aria-label="$t('common.apply')"
                @click="applyManualXP"
              >
                {{ $t('common.apply') }}
              </UButton>
            </div>
          </div>
          <UButton
            icon="i-mdi-refresh"
            block
            variant="soft"
            color="neutral"
            :disabled="tarkovStore.getXpOffset() === 0"
            @click="resetOffset"
          >
            {{ $t('settings.experience.reset_offset') }}
          </UButton>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useXpCalculation } from '@/composables/useXpCalculation';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const { trackSettingChanged } = useProductAnalytics();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const { derivedLevel, setTotalXP, totalXP, xpProgress, xpToNextLevel } = useXpCalculation();
  const formatNumber = useLocaleNumberFormatter();
  const totalXpInputId = 'settings-total-xp-input';
  const manualXPInput = ref<number | null>(null);
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(target.closest('a,button,input,label,select,textarea,[role="button"],[role="switch"]'));
  const setAutomaticLevelCalculation = (value: boolean) => {
    preferencesStore.setUseAutomaticLevelCalculation(value);
    trackSettingChanged({
      area: 'experience',
      name: 'automatic_level_calculation',
      value,
    });
    if (
      value &&
      Array.isArray(metadataStore.playerLevels) &&
      metadataStore.playerLevels.length > 0
    ) {
      tarkovStore.setLevel(derivedLevel.value);
    }
  };
  const toggleAutoLevel = () => {
    setAutomaticLevelCalculation(!preferencesStore.getUseAutomaticLevelCalculation);
  };
  const handleAutoLevelRowClick = (event: MouseEvent) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }
    toggleAutoLevel();
  };
  const isValidXPInput = computed(() => {
    return (
      manualXPInput.value !== null &&
      !isNaN(manualXPInput.value) &&
      manualXPInput.value >= 0 &&
      manualXPInput.value !== totalXP.value
    );
  });
  const applyManualXP = () => {
    if (isValidXPInput.value && manualXPInput.value !== null) {
      setTotalXP(manualXPInput.value);
      trackSettingChanged({
        area: 'experience',
        name: 'manual_total_xp',
        value: manualXPInput.value,
      });
      manualXPInput.value = null;
    }
  };
  const resetOffset = () => {
    tarkovStore.setXpOffset(0);
    trackSettingChanged({
      area: 'experience',
      name: 'xp_offset_reset',
      value: true,
    });
    manualXPInput.value = null;
  };
</script>
