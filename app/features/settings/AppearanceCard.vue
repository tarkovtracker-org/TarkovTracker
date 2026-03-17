<template>
  <GenericCard
    icon="mdi-theme-light-dark"
    icon-color="accent"
    highlight-color="accent"
    :fill-height="false"
    :title="$t('settings.interface.appearance.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <div class="space-y-1">
          <p class="text-foreground text-sm font-semibold">
            {{ $t('settings.interface.appearance.mode') }}
          </p>
          <p class="text-foreground-muted text-sm">
            {{ $t('settings.interface.appearance.description') }}
          </p>
        </div>
        <div class="space-y-2">
          <p class="text-foreground-muted text-sm font-semibold">
            {{ $t('settings.theme') }}
          </p>
          <SelectMenuFixed
            v-model="themeMode"
            :items="themeOptions"
            value-key="value"
            label-key="label"
          >
            <template #leading>
              <UIcon name="i-mdi-theme-light-dark" class="text-foreground-muted h-4 w-4" />
            </template>
          </SelectMenuFixed>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { ThemeMode } from '@/stores/usePreferences';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const themeMode = computed({
    get: () => preferencesStore.getThemeMode,
    set: (value: ThemeMode) => preferencesStore.setThemeMode(value),
  });
  const themeOptions = computed(() => [
    { label: t('settings.interface.appearance.light'), value: 'light' as ThemeMode },
    { label: t('settings.interface.appearance.dark'), value: 'dark' as ThemeMode },
  ]);
</script>
