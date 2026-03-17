<template>
  <GenericCard icon="mdi-account-wrench" icon-color="white" highlight-color="secondary">
    <template #title>
      {{ $t('page.team.card.teamoptions.title') }}
    </template>
    <template #content>
      <div class="space-y-6 px-4 py-4">
        <div class="space-y-3">
          <h3 class="text-foreground text-sm font-semibold tracking-wider uppercase">
            {{ $t('page.team.card.teamoptions.section_tasks') }}
          </h3>
          <div
            class="bg-shell border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
          >
            <p class="text-foreground text-sm font-medium" data-testid="task-toggle">
              {{ $t('page.team.card.teamoptions.toggle_tasks') }}
            </p>
            <USwitch
              :model-value="taskHideAll"
              data-testid="task-switch"
              @update:model-value="(v: boolean) => preferencesStore.setQuestTeamHideAll(v)"
            />
          </div>
        </div>
        <USeparator />
        <div class="space-y-3">
          <h3 class="text-foreground text-sm font-semibold tracking-wider uppercase">
            {{ $t('page.team.card.teamoptions.section_items') }}
          </h3>
          <div class="space-y-2">
            <div
              class="bg-shell border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
            >
              <p class="text-foreground text-sm font-medium">
                {{ $t('page.team.card.teamoptions.toggle_items') }}
              </p>
              <USwitch
                :model-value="itemsHideAll"
                data-testid="items-switch"
                @update:model-value="(v: boolean) => preferencesStore.setItemsTeamHideAll(v)"
              />
            </div>
            <div
              class="bg-shell border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              :class="{ 'opacity-50': itemsHideAll }"
            >
              <p class="text-foreground text-sm font-medium">
                {{ $t('page.team.card.teamoptions.toggle_non_fir') }}
              </p>
              <USwitch
                :model-value="itemsHideNonFIR"
                :disabled="itemsHideAll"
                data-testid="nonfir-switch"
                @update:model-value="(v: boolean) => preferencesStore.setItemsTeamHideNonFIR(v)"
              />
            </div>
            <div
              class="bg-shell border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              :class="{ 'opacity-50': itemsHideAll }"
            >
              <p class="text-foreground text-sm font-medium">
                {{ $t('page.team.card.teamoptions.toggle_hideout') }}
              </p>
              <USwitch
                :model-value="itemsHideHideout"
                :disabled="itemsHideAll"
                data-testid="hideout-switch"
                @update:model-value="(v: boolean) => preferencesStore.setItemsTeamHideHideout(v)"
              />
            </div>
          </div>
        </div>
        <USeparator />
        <div class="space-y-3">
          <h3 class="text-foreground text-sm font-semibold tracking-wider uppercase">
            {{ $t('page.team.card.teamoptions.section_maps') }}
          </h3>
          <div
            class="bg-shell border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
          >
            <p class="text-foreground text-sm font-medium">
              {{ $t('page.team.card.teamoptions.toggle_maps') }}
            </p>
            <USwitch
              :model-value="mapHideAll"
              data-testid="map-switch"
              @update:model-value="(v: boolean) => preferencesStore.setMapTeamHideAll(v)"
            />
          </div>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const preferencesStore = usePreferencesStore();
  const taskHideAll = computed(() => preferencesStore.taskTeamAllHidden);
  const itemsHideAll = computed(() => preferencesStore.itemsTeamAllHidden);
  const itemsHideNonFIR = computed(() => preferencesStore.itemsTeamNonFIRHidden);
  const itemsHideHideout = computed(() => preferencesStore.itemsTeamHideoutHidden);
  const mapHideAll = computed(() => preferencesStore.mapTeamAllHidden);
</script>
