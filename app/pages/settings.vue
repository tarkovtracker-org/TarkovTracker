<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-5xl space-y-4">
      <DisplayNameCard />
      <ExperienceCard />
      <GenericCard
        icon="mdi-gamepad-variant"
        icon-color="accent"
        highlight-color="accent"
        :fill-height="false"
        :title="$t('settings.game_settings.title')"
        title-classes="text-lg font-semibold"
      >
        <template #content>
          <div class="grid gap-4 px-4 py-4 md:grid-cols-2">
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.game_profile.game_edition') }}
              </p>
              <SelectMenuFixed
                v-model="selectedGameEdition"
                :items="gameEditionOptions"
                value-key="value"
              >
                <template #leading>
                  <UIcon name="i-mdi-gift-open" class="text-surface-300 h-4 w-4" />
                </template>
              </SelectMenuFixed>
            </div>
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.prestige.current_level') }}
              </p>
              <SelectMenuFixed
                v-model="currentPrestige"
                :items="prestigeOptions"
                value-key="value"
                :disabled="isPveMode"
              >
                <template #leading>
                  <UIcon
                    name="i-mdi-trophy"
                    class="text-warning-400 h-4 w-4"
                    :class="{ 'opacity-50': isPveMode }"
                  />
                </template>
              </SelectMenuFixed>
            </div>
          </div>
        </template>
      </GenericCard>
      <TaskDisplayCard />
      <MapSettingsCard />
      <SkillsCard />
      <DataManagementCard />
    </div>
  </div>
</template>
<script setup lang="ts">
  import DataManagementCard from '@/features/settings/DataManagementCard.vue';
  import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
  useSeoMeta({
    title: 'Settings',
    description:
      'Customize your TarkovTracker experience. Manage preferences and gameplay settings.',
    robots: 'noindex, nofollow',
  });
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const isPveMode = computed(() => tarkovStore.getCurrentGameMode() === GAME_MODES.PVE);
  const gameEditionOptions = computed(() =>
    metadataStore.editions.map((edition) => ({
      label: edition.title,
      value: edition.value,
    }))
  );
  const selectedGameEdition = computed({
    get(): number {
      return tarkovStore.getGameEdition() || 1;
    },
    set(newValue: number) {
      tarkovStore.setGameEdition(newValue || 1);
    },
  });
  const prestigeOptions = computed(() =>
    Array.from({ length: 7 }, (_, i) => ({
      label: i === 0 ? t('prestige.no_prestige') : t('prestige.prestige_n', { n: i }),
      value: i,
    }))
  );
  const currentPrestige = computed({
    get: () => (isPveMode.value ? 0 : tarkovStore.getPrestigeLevel()),
    set: (newValue: number) => {
      if (!isPveMode.value) {
        tarkovStore.setPrestigeLevel(newValue);
      }
    },
  });
</script>
