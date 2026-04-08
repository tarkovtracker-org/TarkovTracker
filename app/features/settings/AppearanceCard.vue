<template>
  <GenericCard
    icon="mdi-theme-light-dark"
    icon-color="accent"
    highlight-color="accent"
    :fill-height="false"
    :title="t('settings.interface.appearance.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <div class="space-y-1">
          <p class="text-foreground text-sm font-semibold">
            {{ t('settings.interface.appearance.mode') }}
          </p>
          <p class="text-foreground-muted text-sm">
            {{ t('settings.interface.appearance.description') }}
          </p>
        </div>
        <div class="space-y-2">
          <p class="text-foreground-muted text-sm font-semibold">
            {{ t('settings.theme') }}
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
  import { normalizeThemeMode, THEME_MODES, type ThemeMode } from '@/utils/themeMode';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const normalizeThemeModeSelection = (value: unknown): ThemeMode => {
    const directThemeMode = normalizeThemeMode(value);
    if (directThemeMode) return directThemeMode;
    if (value && typeof value === 'object' && 'value' in value) {
      const optionThemeMode = normalizeThemeMode((value as { value?: unknown }).value);
      if (optionThemeMode) return optionThemeMode;
    }
    return preferencesStore.getThemeMode;
  };
  const themeMode = computed({
    get: () => preferencesStore.getThemeMode,
    set: (value: unknown) => preferencesStore.setThemeMode(normalizeThemeModeSelection(value)),
  });
  const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
    dark: 'settings.interface.appearance.dark',
    light: 'settings.interface.appearance.light',
  };
  const themeOptions = computed(() =>
    THEME_MODES.map((mode) => ({
      label: t(THEME_LABEL_KEYS[mode]),
      value: mode,
    }))
  );
</script>
