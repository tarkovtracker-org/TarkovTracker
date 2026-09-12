<template>
  <GenericCard
    icon="mdi-palette-outline"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="$t('settings.appearance.title', 'Appearance')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-3 px-4 py-4">
        <div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div class="space-y-1">
            <p :id="themeLabelId" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.appearance.theme', 'Theme') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{
                $t(
                  'settings.appearance.theme_hint',
                  'Choose between the dark and light interface. Your choice is remembered on this device.'
                )
              }}
            </p>
          </div>
          <fieldset class="m-0 shrink-0 border-0 p-0" :aria-labelledby="themeLabelId">
            <legend class="sr-only">{{ $t('settings.appearance.theme', 'Theme') }}</legend>
            <div
              class="bg-surface-800 border-surface-700 flex shrink-0 items-center gap-1 rounded-lg border p-1"
            >
              <label
                v-for="option in themeOptions"
                :key="option.value"
                class="focus-within:ring-primary-500 relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-within:ring-2"
                :class="
                  themeMode === option.value
                    ? 'bg-surface-700 text-surface-50 shadow-sm'
                    : 'text-surface-400 hover:bg-surface-700/60 hover:text-surface-200'
                "
              >
                <input
                  type="radio"
                  name="theme-mode-selection"
                  :value="option.value"
                  :checked="themeMode === option.value"
                  class="sr-only"
                  @change="setThemeMode(option.value)"
                />
                <UIcon :name="option.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useTheme } from '@/composables/useTheme';
  import type { ThemeMode } from '@/utils/theme';
  const { t } = useI18n({ useScope: 'global' });
  const { themeMode, setThemeMode } = useTheme();
  const themeLabelId = 'settings-appearance-theme-label';
  const themeOptions = computed<{ value: ThemeMode; icon: string; label: string }[]>(() => [
    {
      value: 'dark',
      icon: 'i-heroicons-moon',
      label: t('settings.appearance.theme_dark', 'Dark'),
    },
    {
      value: 'light',
      icon: 'i-heroicons-sun',
      label: t('settings.appearance.theme_light', 'Light'),
    },
  ]);
</script>
