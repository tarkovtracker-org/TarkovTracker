<template>
  <GenericCard
    icon="mdi-palette-outline"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="$t('settings.app_preferences.title')"
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
                class="focus-within:outline-primary-500 light:focus-within:outline-surface-50 relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2"
                :class="
                  themeMode === option.value
                    ? 'bg-surface-700 text-surface-50 light:ring-surface-300 light:ring-2 light:ring-inset shadow-sm'
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
        <USeparator />
        <div>
          <div class="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <label for="settings-appearance-locale" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.locale') }}
            </label>
            <select
              id="settings-appearance-locale"
              :value="locale"
              :disabled="pending"
              :aria-busy="pending"
              aria-describedby="settings-appearance-locale-status"
              class="bg-surface-800 border-surface-700 text-surface-200 block min-h-9 max-w-full rounded-md border px-3 text-sm disabled:opacity-50"
              @change="handleLocaleChange"
            >
              <option
                v-for="code in availableLocales"
                :key="code"
                :value="code"
                :disabled="isDisabled(code)"
              >
                {{ getLocaleNativeName(code) }}
              </option>
            </select>
          </div>
          <p
            id="settings-appearance-locale-status"
            class="text-surface-400 text-sm not-empty:mt-1"
            role="status"
          >
            {{ status }}
          </p>
        </div>
        <USeparator />
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <p :id="privacyModeLabelId" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.general.privacy_mode', 'Privacy Mode') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{
                $t(
                  'settings.general.privacy_mode_hint',
                  "Hides sensitive information while you're streaming."
                )
              }}
            </p>
          </div>
          <USwitch
            class="shrink-0"
            :model-value="streamerMode"
            :aria-labelledby="privacyModeLabelId"
            :disabled="!isLoggedIn || streamerModeCooldown"
            :ui="{
              base: 'data-[state=unchecked]:bg-error-500 data-[state=checked]:bg-success-500',
            }"
            @update:model-value="handleStreamerModeToggle"
          />
        </div>
        <USeparator />
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <p :id="antifandomLabelId" class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.interface.links.antifandom', 'Use antifandom.com') }}
            </p>
            <p class="text-surface-400 text-sm">
              {{
                $t(
                  'settings.interface.links.antifandom_hint',
                  'Open wiki links on antifandom.com, a community-run, ad-light mirror of Fandom, instead of fandom.com.'
                )
              }}
            </p>
          </div>
          <USwitch v-model="useAntifandom" class="shrink-0" :aria-labelledby="antifandomLabelId" />
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useLocaleSwitch } from '@/composables/useLocaleSwitch';
  import { useTheme } from '@/composables/useTheme';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { getLocaleNativeName } from '@/utils/locales';
  import type { SupabaseUser } from '@/types/supabase-plugin';
  import type { ThemeMode } from '@/utils/theme';
  const { t } = useI18n({ useScope: 'global' });
  const { themeMode, setThemeMode } = useTheme();
  const { locale, availableLocales, pending, status, isDisabled, selectLocale } = useLocaleSwitch();
  const handleLocaleChange = async (event: Event) => {
    const element = event.target as HTMLSelectElement;
    await selectLocale(element.value);
    element.value = locale.value;
  };
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
  const preferencesStore = usePreferencesStore();
  const privacyModeLabelId = 'settings-privacy-mode-label';
  const antifandomLabelId = 'settings-antifandom-label';
  const { $supabase } = useNuxtApp();
  const typedUser = computed<SupabaseUser | null>(() => {
    const supabase = $supabase as { user?: SupabaseUser } | undefined;
    return supabase?.user ?? null;
  });
  const isLoggedIn = computed(() => Boolean(typedUser.value?.loggedIn));
  const streamerModeCooldown = ref(false);
  let streamerModeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const streamerMode = computed(() => preferencesStore.getStreamerMode);
  const handleStreamerModeToggle = (newValue: boolean) => {
    if (streamerModeCooldown.value) return;
    preferencesStore.setStreamerMode(newValue);
    streamerModeCooldown.value = true;
    streamerModeTimeoutId = setTimeout(() => {
      streamerModeCooldown.value = false;
      streamerModeTimeoutId = null;
    }, 500);
  };
  const useAntifandom = computed({
    get: () => preferencesStore.getWikiUseAntifandom,
    set: (val) => preferencesStore.setWikiUseAntifandom(val),
  });
  onUnmounted(() => {
    if (streamerModeTimeoutId) {
      clearTimeout(streamerModeTimeoutId);
      streamerModeTimeoutId = null;
    }
  });
</script>
