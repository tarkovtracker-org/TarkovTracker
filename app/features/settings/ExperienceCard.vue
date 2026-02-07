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
        <div class="flex items-center justify-between gap-3">
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
            @update:model-value="handleAutoLevelToggle"
          />
        </div>
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
          <div class="bg-surface-800/35 h-2 overflow-hidden rounded-full">
            <div
              class="bg-primary-500/60 h-full rounded-full transition-[width] duration-300 ease-out"
              :style="{ width: `${xpProgress}%` }"
            ></div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex flex-1 items-center gap-2">
            <label class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.experience.set_total_xp') }}
            </label>
            <UTooltip :text="$t('settings.experience.manual_hint')">
              <UIcon name="i-mdi-information" class="text-surface-400 h-4 w-4" />
            </UTooltip>
          </div>
          <div class="flex max-w-xs items-center gap-2">
            <UInput
              v-model.number="manualXPInput"
              type="number"
              :min="0"
              :placeholder="totalXP.toString()"
              size="sm"
              class="w-32"
            />
            <UButton
              icon="i-mdi-check"
              size="sm"
              color="primary"
              :disabled="!isValidXPInput"
              :aria-label="$t('settings.experience.apply')"
              @click="applyManualXP"
            />
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
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useXpCalculation } from '@/composables/useXpCalculation';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const { derivedLevel, setTotalXP, totalXP, xpProgress, xpToNextLevel } = useXpCalculation();
  const formatNumber = useLocaleNumberFormatter();
  const manualXPInput = ref<number | null>(null);
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
      manualXPInput.value = null;
    }
  };
  const resetOffset = () => {
    tarkovStore.setXpOffset(0);
    manualXPInput.value = null;
  };
  const handleAutoLevelToggle = (value: boolean) => {
    preferencesStore.setUseAutomaticLevelCalculation(value);
    if (value) {
      tarkovStore.setLevel(derivedLevel.value);
    }
  };
</script>
