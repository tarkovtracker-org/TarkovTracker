<template>
  <GenericCard
    icon="mdi-shield-account-outline"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="$t('settings.faction.title')"
    :subtitle="$t(getGameModeLabel(currentMode))"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="px-4 py-3">
        <FactionPicker v-model="faction" :disabled="dataLoading" class="max-w-50" />
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import FactionPicker from '@/components/FactionPicker.vue';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useCurrentFaction } from '@/composables/useCurrentFaction';
  import { useGameModeSwitch } from '@/composables/useGameModeSwitch';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getGameModeLabel } from '@/utils/constants';
  const tarkovStore = useTarkovStore();
  const currentMode = computed(() => tarkovStore.getCurrentGameMode());
  const faction = useCurrentFaction();
  const { dataLoading } = useGameModeSwitch();
</script>
