<template>
  <GenericCard
    icon="mdi-link-variant"
    icon-color="info"
    highlight-color="info"
    :fill-height="false"
    :title="$t('settings.interface.links.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <p class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.interface.links.antifandom') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{ $t('settings.interface.links.antifandom_hint') }}
            </p>
          </div>
          <USwitch v-model="useAntifandom" />
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const preferencesStore = usePreferencesStore();
  const useAntifandom = computed({
    get: () => preferencesStore.getWikiUseAntifandom,
    set: (val) => preferencesStore.setWikiUseAntifandom(val),
  });
</script>
